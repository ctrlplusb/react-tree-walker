/* eslint-disable no-console */

// Inspired by the awesome work by the Apollo team: 😘
// https://github.com/apollographql/react-apollo/blob/master/src/getDataFromTree.ts
//
// This version has been adapted to be Promise based and support native Preact.

const defaultOptions = {
  componentWillUnmount: false,
}

// Lifted from https://github.com/sindresorhus/p-reduce
// Thanks @sindresorhus! 🙏
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
// Thanks @sindresorhus! 🙏
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

// Preact puts children directly on element, and React via props
const getChildren = element =>
  element.props && element.props.children
    ? element.props.children
    : element.children
      ? element.children
      : undefined

// Preact uses "nodeName", React uses "type"
const getType = element => element.type || element.nodeName

// Preact uses "attributes", React uses "props"
const getProps = element => element.props || element.attributes

const isReactElement = element => !!getType(element)

const isClassComponent = Comp =>
  Comp.prototype &&
  (Comp.prototype.render ||
    Comp.prototype.isReactComponent ||
    Comp.prototype.isPureReactComponent)

const providesChildContext = instance => !!instance.getChildContext

// Recurse a React Element tree, running the provided visitor against each element.
// If a visitor call returns `false` then we will not recurse into the respective
// elements children.
export default function reactTreeWalker(
  tree,
  visitor,
  context,
  options = defaultOptions,
) {
  return new Promise((resolve, reject) => {
    const safeVisitor = (...args) => {
      try {
        return visitor(...args)
      } catch (err) {
        reject(err)
      }
      return undefined
    }

    const recursive = (currentElement, currentContext) => {
      if (Array.isArray(currentElement)) {
        return Promise.all(
          currentElement.map(item => recursive(item, currentContext)),
        )
      }

      if (!currentElement) {
        return Promise.resolve()
      }

      if (
        typeof currentElement === 'string' ||
        typeof currentElement === 'number'
      ) {
        // Just visit these, they are leaves so we don't keep traversing.
        safeVisitor(currentElement, null, currentContext)
        return Promise.resolve()
      }

      if (currentElement.type) {
        if (currentElement.type._context) {
          // eslint-disable-next-line no-param-reassign
          currentElement.type._context._currentValue =
            currentElement.props.value
        }
        if (currentElement.type.Provider && currentElement.type.Consumer) {
          const el = currentElement.props.children(
            currentElement.type.Provider._context._currentValue,
          )
          return recursive(el, currentContext)
        }
      }

      if (isReactElement(currentElement)) {
        return new Promise(innerResolve => {
          const visitCurrentElement = (
            render,
            compInstance,
            elContext,
            childContext,
          ) =>
            Promise.resolve(
              safeVisitor(
                currentElement,
                compInstance,
                elContext,
                childContext,
              ),
            )
              .then(result => {
                if (result !== false) {
                  // A false wasn't returned so we will attempt to visit the children
                  // for the current element.
                  const tempChildren = render()
                  const children = ensureChild(tempChildren)
                  if (children) {
                    if (Array.isArray(children)) {
                      // If its a react Children collection we need to breadth-first
                      // traverse each of them, and pMapSeries allows us to do a
                      // depth-first traversal that respects Promises. Thanks @sindresorhus!
                      return pMapSeries(
                        children,
                        child =>
                          child
                            ? recursive(child, childContext)
                            : Promise.resolve(),
                      )
                        .then(innerResolve, reject)
                        .catch(reject)
                    }
                    // Otherwise we pass the individual child to the next recursion.
                    return recursive(children, childContext)
                      .then(innerResolve, reject)
                      .catch(reject)
                  }
                }
                return undefined
              })
              .catch(reject)

          if (typeof getType(currentElement) === 'function') {
            const Component = getType(currentElement)
            const props = Object.assign(
              {},
              Component.defaultProps,
              getProps(currentElement),
              // For Preact support so that the props get passed into render
              // function.
              {
                children: getChildren(currentElement),
              },
            )

            if (isClassComponent(Component)) {
              // Class component
              const instance = new Component(props, currentContext)

              // In case the user doesn't pass these to super in the constructor
              Object.defineProperty(instance, 'props', {
                value: instance.props || props,
              })
              instance.context = instance.context || currentContext
              // set the instance state to null (not undefined) if not set, to match React behaviour
              instance.state = instance.state || null

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

              if (Component.getDerivedStateFromProps) {
                const result = Component.getDerivedStateFromProps(
                  instance.props,
                  instance.state,
                )
                if (result !== null) {
                  instance.state = Object.assign({}, instance.state, result)
                }
              } else if (instance.UNSAFE_componentWillMount) {
                instance.UNSAFE_componentWillMount()
              } else if (instance.componentWillMount) {
                instance.componentWillMount()
              }

              const childContext = providesChildContext(instance)
                ? Object.assign({}, currentContext, instance.getChildContext())
                : currentContext

              visitCurrentElement(
                // Note: preact API also allows props and state to be referenced
                // as arguments to the render func, so we pass them through
                // here
                () => instance.render(instance.props, instance.state),
                instance,
                currentContext,
                childContext,
              )
                .then(() => {
                  if (
                    options.componentWillUnmount &&
                    instance.componentWillUnmount
                  ) {
                    instance.componentWillUnmount()
                  }
                })
                .then(innerResolve)
            } else {
              // Stateless Functional Component
              visitCurrentElement(
                () => Component(props, currentContext),
                null,
                currentContext,
                currentContext,
              ).then(innerResolve)
            }
          } else {
            // A basic element, such as a dom node, string, number etc.
            visitCurrentElement(
              () => getChildren(currentElement),
              null,
              currentContext,
              currentContext,
            ).then(innerResolve)
          }
        })
      }

      // Portals
      if (
        currentElement.containerInfo &&
        currentElement.children &&
        currentElement.children.props &&
        Array.isArray(currentElement.children.props.children)
      ) {
        return Promise.all(
          currentElement.children.props.children.map(child =>
            recursive(child, currentContext),
          ),
        )
      }

      return Promise.resolve()
    }

    recursive(tree, context).then(resolve, reject)
  })
}
