/* eslint-disable no-console */

// Inspired by the awesome work done by the Apollo team.
// See https://github.com/apollostack/react-apollo/blob/master/src/server.ts
// This version has been adapted to be promise based.

// eslint-disable-next-line import/no-extraneous-dependencies
import { Children } from 'react'

const defaultOptions = {
  componentWillUnmount: false,
}

// Lifted from https://github.com/sindresorhus/p-reduce
// Thanks @sindresorhus!
const pReduce = (iterable, reducer, initVal) =>
  new Promise((resolve, reject) => {
    const iterator = iterable[Symbol.iterator]()
    let i = 0

    const next = total => {
      const el = iterator.next()

      if (el.done) {
        resolve(total)
        return
      }

      Promise.all([total, el.value])
        .then(value => {
          // eslint-disable-next-line no-plusplus
          next(reducer(value[0], value[1], i++))
        })
        .catch(reject)
    }

    next(initVal)
  })

// Lifted from https://github.com/sindresorhus/p-map-series
// Thanks @sindresorhus!
const pMapSeries = (iterable, iterator) => {
  const ret = []

  return pReduce(iterable, (a, b, i) =>
    Promise.resolve(iterator(b, i)).then(val => {
      ret.push(val)
    }),
  ).then(() => ret)
}

const ensureChild = child =>
  child && typeof child.render === 'function'
    ? ensureChild(child.render())
    : child

// Recurse an React Element tree, running visitor on each element.
// If visitor returns `false`, don't call the element's render function
// or recurse into its child elements
export default function reactTreeWalker(
  rootElement,
  visitor,
  rootContext,
  options = defaultOptions,
) {
  return new Promise((resolve, reject) => {
    const safeVisitor = visitor.isSafe
      ? visitor
      : (...args) => {
          try {
            return visitor(...args)
          } catch (err) {
            reject(err)
          }
          return undefined
        }

    const recursive = (currentElement, currentContext) =>
      new Promise(innerResolve => {
        const visitCurrentElement = (childResolver, context, compInstance) =>
          Promise.resolve(safeVisitor(currentElement, compInstance, context))
            .then(result => {
              if (result === false) {
                // Visitor returned false, indicating a desire to not visit
                // the children of the current element, so we will just resolve.
                innerResolve()
              } else {
                // A false wasn't returned so we will attempt to visit the children
                // for the current element.
                const child = ensureChild(childResolver())
                const theChildContext =
                  typeof context === 'function' ? context() : context

                if (child == null) {
                  // No children. We've reached the end of this branch. resolve.
                  innerResolve()
                } else if (Children.count(child)) {
                  // If its a react Children collection we need to breadth-first
                  // traverse each of them, and pMapSeries allows us to do a
                  // depth-first traversal that respects Promises. Thanks @sindresorhus!
                  pMapSeries(
                    Children.map(child, cur => cur),
                    aChild =>
                      aChild ? recursive(aChild, theChildContext) : undefined,
                  )
                    .then(innerResolve, reject)
                    .catch(reject)
                } else {
                  // Otherwise we pass the individual child to the next recursion.
                  recursive(child, theChildContext)
                    .then(innerResolve, reject)
                    .catch(reject)
                }
              }
            })
            .catch(reject)

        // Is this element a Component?
        if (typeof currentElement.type === 'function') {
          const Component = currentElement.type
          const props = Object.assign(
            {},
            Component.defaultProps,
            currentElement.props,
          )

          // Is this a class component? (http://bit.ly/2j9Ifk3)
          const isReactClassComponent =
            Component.prototype &&
            (Component.prototype.isReactComponent ||
              Component.prototype.isPureReactComponent)

          if (isReactClassComponent) {
            // React class component

            const instance = new Component(props, currentContext)

            // In case the user doesn't pass these to super in the constructor
            instance.props = instance.props || props
            instance.context = instance.context || currentContext

            // Make the setState synchronous.
            instance.setState = newState => {
              if (typeof newState === 'function') {
                // eslint-disable-next-line no-param-reassign
                newState = newState(
                  instance.state,
                  instance.props,
                  instance.context,
                )
              }
              instance.state = Object.assign({}, instance.state, newState)
            }

            visitCurrentElement(
              () => {
                if (instance.componentWillMount) {
                  instance.componentWillMount()
                }
                return instance.render()
              },
              () =>
                // Ensure the child context is initialised if it is available.
                // We will need to pass it down the tree.
                instance.getChildContext
                  ? Object.assign(
                      {},
                      currentContext,
                      instance.getChildContext(),
                    )
                  : currentContext,
              instance,
            ).then(() => {
              if (
                options.componentWillUnmount &&
                instance.componentWillUnmount
              ) {
                instance.componentWillUnmount()
              }
            })
          } else {
            // Stateless Functional Component
            visitCurrentElement(
              () => Component(props, currentContext),
              currentContext,
            )
          }
        } else {
          // This must be a basic element, such as a string or dom node.
          visitCurrentElement(
            () =>
              currentElement.props && currentElement.props.children
                ? currentElement.props.children
                : undefined,
            currentContext,
          )
        }
      })

    recursive(rootElement, rootContext).then(resolve, reject)
  })
}
