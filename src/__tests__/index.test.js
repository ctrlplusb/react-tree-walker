/* eslint-disable react/sort-comp */
/* eslint-disable react/no-multi-comp */
/* eslint-disable react/prop-types */
/* eslint-disable react/prefer-stateless-function */
/* eslint-disable react/require-default-props */
/* eslint-disable class-methods-use-this */

import React, {
  createElement as reactCreateElement,
  Component as ReactComponent,
} from 'react'
import ReactDOM from 'react-dom'
import {
  createElement as preactCreateElement,
  Component as PreactComponent,
} from 'preact'
import PropTypes from 'prop-types'
import reactTreeWalker from '../index'

const resolveLater = result =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve(result)
    }, 10),
  )

describe('reactTreeWalker', () => {
  describe('react + preact', () => {
    ;[
      { Component: ReactComponent, h: reactCreateElement },
      { Component: PreactComponent, h: preactCreateElement },
    ].forEach(({ Component, h }) => {
      const Stateless = jest.fn(({ children }) => <div>{children}</div>)
      Stateless.contextTypes = { theContext: PropTypes.string.isRequired }

      class Stateful extends Component {
        getData() {
          return typeof this.props.data === 'function'
            ? this.props.data()
            : this.props.data
        }

        render() {
          return h('div', null, this.props.children)
        }
      }

      const createTree = ({ async } = { async: false }) => {
        const Foo = Stateful
        const Bob = Stateless
        return h('div', null, [
          h('h1', null, 'Hello World!'),
          h(Foo, { data: async ? () => resolveLater(1) : 1 }),
          h(
            Foo,
            {
              data: async ? () => resolveLater(2) : 2,
            },
            h('div', null, [
              h(
                Bob,
                null,
                h(Foo, {
                  children: [
                    h(Foo, { data: async ? () => resolveLater(5) : 5 }),
                    h(Foo, { data: async ? () => resolveLater(6) : 6 }),
                  ],
                  data: async ? () => resolveLater(4) : 4,
                }),
              ),
              h('div', null, 'hi!'),
            ]),
          ),
          h(Foo, { data: async ? () => resolveLater(3) : 3 }),
        ])
      }

      it('simple sync visitor', () => {
        const actual = []
        const visitor = (element, instance) => {
          if (instance && typeof instance.getData === 'function') {
            const data = instance.getData()
            actual.push(data)
          }
        }
        return reactTreeWalker(createTree(), visitor).then(() => {
          const expected = [1, 2, 4, 5, 6, 3]
          expect(actual).toEqual(expected)
        })
      })

      it('promise based visitor', () => {
        const actual = []
        const visitor = (element, instance) => {
          if (instance && typeof instance.getData === 'function') {
            return instance.getData().then(data => {
              actual.push(data)
              return true
            })
          }
          return true
        }
        return reactTreeWalker(createTree({ async: true }), visitor).then(
          () => {
            const expected = [1, 2, 4, 5, 6, 3]
            expect(actual).toEqual(expected)
          },
        )
      })

      it('promise based visitor stops resolving', () => {
        const actual = []
        const visitor = (element, instance) => {
          if (instance && typeof instance.getData === 'function') {
            return instance.getData().then(data => {
              actual.push(data)
              return data !== 4
            })
          }
          return true
        }
        return reactTreeWalker(createTree({ async: true }), visitor).then(
          () => {
            const expected = [1, 2, 4, 3]
            expect(actual).toEqual(expected)
          },
        )
      })

      it('componentWillMount & setState', () => {
        let actual = {}

        class Foo extends Component {
          constructor(props) {
            super(props)
            this.state = { foo: 'foo' }
          }

          componentWillMount() {
            this.setState({ foo: 'bar' })
            this.setState((state, props) => ({
              other: `I am ${props.value} ${state.foo}`,
            }))
          }

          render() {
            actual = this.state
            return h('div', null, this.state.foo)
          }
        }

        return reactTreeWalker(h(Foo, { value: 'foo' }), () => true).then(
          () => {
            const expected = { foo: 'bar', other: 'I am foo bar' }
            expect(actual).toMatchObject(expected)
          },
        )
      })

      it('UNSAFE_componentWillMount', () => {
        let actual = {}

        class Foo extends Component {
          constructor(props) {
            super(props)
            this.state = { foo: 'foo' }
          }

          UNSAFE_componentWillMount() {
            this.setState({ foo: 'bar' })
          }

          render() {
            actual = this.state
            return h('div', null, this.state.foo)
          }
        }

        return reactTreeWalker(h(Foo, { value: 'foo' }), () => true).then(
          () => {
            const expected = { foo: 'bar' }
            expect(actual).toMatchObject(expected)
          },
        )
      })

      it('getDerivedStateFromProps', () => {
        let actual = {}

        class Foo extends Component {
          constructor(props) {
            super(props)
            this.state = { foo: 'foo' }
          }

          static getDerivedStateFromProps(props, state) {
            return { foo: `${state.foo}bar` }
          }

          render() {
            actual = this.state
            return h('div', null, this.state.foo)
          }
        }

        return reactTreeWalker(h(Foo, { value: 'foo' }), () => true).then(
          () => {
            const expected = { foo: 'foobar' }
            expect(actual).toMatchObject(expected)
          },
        )
      })

      it('calls componentWillUnmount', () => {
        let called = true

        class Foo extends Component {
          componentWillUnmount() {
            called = true
          }

          render() {
            return 'foo'
          }
        }

        return reactTreeWalker(h(Foo), () => true, null, {
          componentWillUnmount: true,
        }).then(() => {
          expect(called).toBeTruthy()
        })
      })

      it('getChildContext', () => {
        class Foo extends Component {
          getChildContext() {
            return { foo: 'val' }
          }

          render() {
            return h('div', null, this.props.children)
          }
        }

        let actual
        function Bar(props, context) {
          actual = context
          return 'bar'
        }
        Bar.contextTypes = { foo: PropTypes.string.isRequired }

        return reactTreeWalker(h(Foo, null, h(Bar)), () => true).then(() => {
          const expected = { foo: 'val' }
          expect(actual).toMatchObject(expected)
        })
      })

      it('works with instance-as-result component', () => {
        class Foo extends Component {
          render() {
            return h('div', null, [
              h(Stateful, { data: 1 }),
              h(Stateful, { data: 2 }),
            ])
          }
        }
        const Bar = props => new Foo(props)
        const actual = []
        const visitor = (element, instance) => {
          if (instance && typeof instance.getData === 'function') {
            const data = instance.getData()
            actual.push(data)
          }
        }
        return reactTreeWalker(h(Bar), visitor).then(() => {
          const expected = [1, 2]
          expect(actual).toEqual(expected)
        })
      })

      describe('error handling', () => {
        it('throws async visitor errors', () => {
          const tree = createTree({ async: true })
          const actual = []
          const visitor = (element, instance) => {
            if (instance && typeof instance.getData === 'function') {
              return instance.getData().then(data => {
                actual.push(data)
                if (data === 4) {
                  return Promise.reject(new Error('Visitor made 💩'))
                }
                return true
              })
            }
            return true
          }
          return reactTreeWalker(tree, visitor).then(
            () => {
              throw new Error('Expected error was not thrown')
            },
            err => {
              expect(err).toMatchObject(new Error('Visitor made 💩'))
              expect(actual).toEqual([1, 2, 4])
            },
          )
        })

        it('throws sync visitor errors', () => {
          const tree = createTree()
          const actual = []
          const visitor = (element, instance) => {
            if (instance && typeof instance.getData === 'function') {
              const data = instance.getData()
              actual.push(data)
              if (data === 4) {
                throw new Error('Visitor made 💩')
              }
            }
            return true
          }
          return reactTreeWalker(tree, visitor).then(
            () => {
              throw new Error('Expected error was not thrown')
            },
            err => {
              expect(err).toMatchObject(new Error('Visitor made 💩'))
              expect(actual).toEqual([1, 2, 4])
            },
          )
        })
      })

      it('complex context configuration', () => {
        class Wrapper extends Component {
          getChildContext() {
            this.id = 0

            return {
              foo: {
                getNextId: () => {
                  this.id += 1
                  return this.id
                },
              },
            }
          }

          render() {
            return this.props.children
          }
        }

        const ids = []
        class Baz extends Component {
          getData() {
            if (!this.context.foo) {
              return undefined
            }
            return new Promise(resolve => setTimeout(resolve, 1000)).then(
              () => {
                this.resolved = true
                ids.push(this.context.foo.getNextId())
              },
            )
          }

          render() {
            return this.resolved ? this.props.children : null
          }
        }

        const visitor = (element, instance) => {
          if (instance && typeof instance.getData === 'function') {
            return instance.getData()
          }
          return undefined
        }

        const app = h(
          Wrapper,
          null,
          h(
            'div',
            null,
            h(Baz, null, h('div', null, [h(Baz), h(Baz), h(Baz)])),
          ),
        )

        return reactTreeWalker(app, visitor).then(() => {
          expect(ids).toEqual([1, 2, 3, 4])
        })
      })
    })
  })

  describe('react', () => {
    it('supports new context API', () => {
      const { Provider, Consumer } = React.createContext()

      class Foo extends React.Component {
        render() {
          return this.props.children
        }
      }

      const tree = (
        <Provider
          value={{
            message: 'Message',
            identity: x => x,
          }}
        >
          <Consumer>
            {({ message, identity }) => (
              <strong>
                <i>{`${message}: ${identity('Hello world')}`}</i>
              </strong>
            )}
          </Consumer>
          bar
          <Foo>foo</Foo>
        </Provider>
      )

      const elements = []
      return reactTreeWalker(tree, element => {
        elements.push(element)
      }).then(() => {
        expect(elements.pop()).toBe('foo')
        expect(elements.pop().type).toBe(Foo)
        expect(elements.pop()).toBe('bar')
        expect(elements.pop()).toBe('Message: Hello world')
        expect(elements.pop().type).toBe('i')
        expect(elements.pop().type).toBe('strong')
      })
    })

    it('supports portals', () => {
      class Foo extends ReactComponent {
        getData() {
          return this.props.data
        }

        render() {
          return 'foo'
        }
      }

      function Baz() {
        return ReactDOM.createPortal(
          <div>
            <Foo data={1} />
            <Foo data={2} />
          </div>,
          document.createElement('div'),
        )
      }

      const actual = []
      const visitor = (element, instance) => {
        if (instance && typeof instance.getData === 'function') {
          const data = instance.getData()
          actual.push(data)
        }
      }
      return reactTreeWalker(<Baz />, visitor).then(() => {
        const expected = [1, 2]
        expect(actual).toEqual(expected)
      })
    })

    it('supports forwardRef', () => {
      class Foo extends ReactComponent {
        render() {
          return this.props.children
        }
      }

      const Bar = React.forwardRef((props, ref) => <Foo ref={ref} {...props} />)
      const ref = React.createRef()

      const tree = <Bar ref={ref}>foo</Bar>

      const elements = []
      return reactTreeWalker(tree, element => {
        elements.push(element)
      }).then(() => {
        expect(elements.pop()).toBe('foo')
        expect(elements.pop().type).toBe(Foo)
        expect(elements.pop().type).toBe(Bar)
      })
    })
  })
})
