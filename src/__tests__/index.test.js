/* eslint-disable react/sort-comp */
/* eslint-disable react/no-multi-comp */
/* eslint-disable react/prop-types */
/* eslint-disable react/require-default-props */
/* eslint-disable class-methods-use-this */

import React, { Component } from 'react'
import PropTypes from 'prop-types'
import reactTreeWalker from '../index'

const Bob = ({ children }) => <div>{children}</div>

describe('reactTreeWalker', () => {
  class Foo extends Component {
    constructor(props) {
      super(props)
      // $FlowIgnore
      this.getData = this.getData.bind(this)
    }

    getData() {
      return typeof this.props.data === 'function'
        ? this.props.data()
        : this.props.data
    }

    render() {
      return this.props.children
    }
  }

  const resolveLater = result =>
    new Promise(resolve =>
      setTimeout(() => {
        resolve(result)
      }, 10),
    )

  const createTree = async => (
    <div>
      <h1>Hello World!</h1>
      <Foo data={async ? () => resolveLater(1) : 1} />
      <Foo data={async ? () => resolveLater(2) : 2}>
        <div>
          <Bob>
            <Foo data={async ? () => resolveLater(4) : 4}>
              <Foo data={async ? () => resolveLater(5) : 5} />
              <Foo data={async ? () => resolveLater(6) : 6} />
            </Foo>
          </Bob>
          <div>hi!</div>
        </div>
      </Foo>
      <Foo data={async ? () => resolveLater(3) : 3} />
    </div>
  )

  it('simple sync visitor', () => {
    const tree = createTree(false)
    const actual = []
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getData === 'function') {
        const data = instance.getData()
        actual.push(data)
      }
    }
    return reactTreeWalker(tree, visitor).then(() => {
      const expected = [1, 2, 4, 5, 6, 3]
      expect(actual).toEqual(expected)
    })
  })

  it('promise based visitor', () => {
    const tree = createTree(true)
    const actual = []
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getData === 'function') {
        return instance.getData().then(data => {
          actual.push(data)
          return true
        })
      }
      return true
    }
    return reactTreeWalker(tree, visitor).then(() => {
      const expected = [1, 2, 4, 5, 6, 3]
      expect(actual).toEqual(expected)
    })
  })

  it('promise based visitor stops resolving', () => {
    const tree = createTree(true)
    const actual = []
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getData === 'function') {
        return instance.getData().then(data => {
          actual.push(data)
          return data !== 4
        })
      }
      return true
    }
    return reactTreeWalker(tree, visitor).then(() => {
      const expected = [1, 2, 4, 3]
      expect(actual).toEqual(expected)
    })
  })

  it('componentWillMount & setState', () => {
    let actual = {}

    class Baz extends Component {
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
        return <div>{this.state.foo}</div>
      }
    }

    return reactTreeWalker(<Baz value="foo" />, () => true).then(() => {
      const expected = { foo: 'bar', other: 'I am foo bar' }
      expect(actual).toMatchObject(expected)
    })
  })

  it('calls componentWillUnmount and does not fail if it errors', () => {
    let called = true

    class Baz extends Component {
      componentWillUnmount() {
        called = true
        throw new Error('An error during unmount')
      }

      render() {
        return <div>foo</div>
      }
    }

    return reactTreeWalker(<Baz />, () => true, null, {
      componentWillUnmount: true,
    }).then(() => {
      expect(called).toBeTruthy()
    })
  })

  it('getChildContext', () => {
    class Baz extends Component {
      props: { children?: any }
      getChildContext() {
        return { foo: 'bar' }
      }
      render() {
        return <div>{this.props.children}</div>
      }
    }

    let actual
    function Qux(props, context) {
      actual = context
      return <div>qux</div>
    }
    Qux.contextTypes = { foo: PropTypes.string.isRequired }

    const tree = (
      <Baz>
        <Qux />
      </Baz>
    )
    return reactTreeWalker(tree, () => true).then(() => {
      const expected = { foo: 'bar' }
      expect(actual).toMatchObject(expected)
    })
  })

  it('works with instance-as-result component', () => {
    // eslint-disable-next-line react/prefer-stateless-function
    class Baz extends Component {
      render() {
        return (
          <div>
            <Foo data={1} />
            <Foo data={2} />
          </div>
        )
      }
    }
    const Bar = props => new Baz(props)
    const tree = (
      <div>
        <Bar />
      </div>
    )
    const actual = []
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getData === 'function') {
        const data = instance.getData()
        actual.push(data)
      }
    }
    return reactTreeWalker(tree, visitor).then(() => {
      const expected = [1, 2]
      expect(actual).toEqual(expected)
    })
  })

  describe('error handling', () => {
    it('throws async visitor errors', () => {
      const tree = createTree(true)
      const actual = []
      // eslint-disable-next-line no-unused-vars
      const visitor = (element, instance, context) => {
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
      const tree = createTree(false)
      const actual = []
      // eslint-disable-next-line no-unused-vars
      const visitor = (element, instance, context) => {
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
})
