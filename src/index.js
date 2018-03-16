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

export const isPromise = x => x != null && typeof x.then === 'function'

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
        const doVisit = (getChildren, visitResult, childContext) => {
          const visitChildren = () => {
            const child = ensureChild(getChildren())
            const theChildContext =
              typeof childContext === 'function' ? childContext() : childContext

            if (child == null) {
              // If no children then we can't traverse.  We've reached the leaf.
              innerResolve()
            } else if (Children.count(child)) {
              // If its a react Children collection we need to breadth-first
              // traverse each of them.
              const mapper = aChild =>
                aChild ? recursive(aChild, theChildContext) : undefined
              const children = Children.map(child, cur => cur)
              // pMapSeries allows us to do depth-first traversal. Thanks @sindresorhus!
              pMapSeries(children, mapper)
                .then(innerResolve, reject)
                .catch(reject)
            } else {
              // Otherwise we pass the individual child to the next recursion.
              recursive(child, theChildContext)
                .then(innerResolve, reject)
                .catch(reject)
            }
          }

          if (visitResult === false) {
            // Visitor returned false, indicating a desire to not traverse.
            innerResolve()
          } else if (isPromise(visitResult)) {
            // We need to execute the result and pass it's result through to our
            // continuer.
            visitResult
              .then(promiseResult => {
                if (promiseResult === false) {
                  innerResolve()
                } else {
                  visitChildren()
                }
              })
              .catch(reject)
          } else {
            // Visitor returned true, indicating a desire to continue traversing.
            visitChildren()
          }
        }

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

            doVisit(
              () => {
                // Call componentWillMount if it exists.
                if (instance.componentWillMount) {
                  instance.componentWillMount()
                }

                const children = instance.render()

                if (
                  options.componentWillUnmount &&
                  instance.componentWillUnmount
                ) {
                  try {
                    instance.componentWillUnmount()
                  } catch (err) {
                    // This is an experimental feature, we don't want to break
                    // the bootstrapping process, but lets warn the user it
                    // occurred.
                    console.warn(
                      'Error calling componentWillUnmount whilst walking your react tree',
                    )
                    console.warn(err)
                  }
                }

                return children
              },
              safeVisitor(currentElement, instance, currentContext),
              () =>
                // Ensure the child context is initialised if it is available. We will
                // need to pass it down the tree.
                instance.getChildContext
                  ? Object.assign(
                      {},
                      currentContext,
                      instance.getChildContext(),
                    )
                  : currentContext,
            )
          } else {
            // Stateless Functional Component
            doVisit(
              () => Component(props, currentContext),
              safeVisitor(currentElement, null, currentContext),
              currentContext,
            )
          }
        } else {
          // This must be a basic element, such as a string or dom node.
          doVisit(
            () =>
              currentElement.props && currentElement.props.children
                ? currentElement.props.children
                : undefined,
            safeVisitor(currentElement, null, currentContext),
            currentContext,
          )
        }
      })

    recursive(rootElement, rootContext).then(resolve, reject)
  })
}
