/* @flow */
/* eslint-disable react/sort-comp */
/* eslint-disable react/no-multi-comp */
/* eslint-disable react/prop-types */
/* eslint-disable react/require-default-props */
/* eslint-disable class-methods-use-this */

import React, { Component } from 'react';
import reactTreeWalker from '../index';

const Bob = ({ children }) => <div>{children}</div>;

describe('reactTreeWalker', () => {
  class Foo extends Component {
    props: { children?: any, something: any }

    constructor(props) {
      super(props);
      // $FlowIgnore
      this.getSomething = this.getSomething.bind(this);
    }

    getSomething() {
      return typeof this.props.something === 'function'
        ? this.props.something()
        : this.props.something;
    }

    render() {
      return <div>{this.props.children}</div>;
    }
  }

  const resolveLater = result => new Promise(resolve => setTimeout(() => {
    resolve(result);
  }, 10));

  const createTree = async => (
    <div>
      <h1>Hello World!</h1>
      <Foo something={async ? () => resolveLater(1) : 1} />
      <Foo something={async ? () => resolveLater(2) : 2}>
        <div>
          <Bob>
            <Foo something={async ? () => resolveLater(4) : 4}>
              <Foo something={async ? () => resolveLater(5) : 5} />
            </Foo>
          </Bob>
          <div>hi!</div>
        </div>
      </Foo>
      <Foo something={async ? () => resolveLater(3) : 3} />
    </div>
  );

  it('simple sync', () => {
    const tree = createTree(false);
    const actual = [];
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getSomething) {
        const something = instance.getSomething();
        actual.push(something);
      }
    };
    reactTreeWalker(tree, visitor);
    const expected = [1, 2, 4, 5, 3];
    expect(actual).toEqual(expected);
  });

  it('complex async', () => {
    const treeRoot = createTree(true);
    const actual = [];

    const doWalk = (el, ctx = {}, fetchRoot = false) => {
      const somethings = [];

      // eslint-disable-next-line no-unused-vars
      const visitor = (element, instance, context) => {
        const skipRoot = !fetchRoot && (element === el);
        if (instance && typeof instance.getSomething === 'function' && !skipRoot) {
          const something = instance.getSomething();
          somethings.push({ something, element, context });
          return false;
        }
        return undefined;
      };

      reactTreeWalker(el, visitor, ctx);

      // eslint-disable-next-line arrow-body-style
      const promises = somethings.map(({ something, element, context }) => {
        return something.then((result) => {
          actual.push(result);
          return doWalk(element, context);
        });
      });

      return promises.length > 0
        ? Promise.all(promises)
        : Promise.resolve([]);
    };

    return doWalk(treeRoot, {}, true).then(() => {
      const expected = [1, 2, 3, 4, 5];
      expect(actual).toEqual(expected);
    });
  });

  it('componentWillMount & setState', () => {
    class Baz extends Component {
      state: { foo: string }

      constructor(props) {
        super(props);
        this.state = { foo: 'foo' };
      }

      componentWillMount() {
        this.setState({ foo: 'bar' });
      }

      getState() {
        return this.state;
      }

      render() {
        return <div>foo</div>;
      }
    }

    const tree = <Baz />;
    let actual = {};
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => {
      if (instance && typeof instance.getState) {
        actual = instance.getState();
      }
    };
    reactTreeWalker(tree, visitor);
    const expected = { foo: 'bar' };
    expect(actual).toMatchObject(expected);
  });

  it('getChildContext', () => {
    class Baz extends Component {
      props: { children?: any }
      getChildContext() {
        return { foo: 'bar' };
      }
      render() {
        return <div>{this.props.children}</div>;
      }
    }

    let actual;
    function Qux(props, context) {
      actual = context;
      return <div>qux</div>;
    }
    Qux.contextTypes = { foo: React.PropTypes.string.isRequired };

    const tree = <Baz><Qux /></Baz>;
    // eslint-disable-next-line no-unused-vars
    const visitor = (element, instance, context) => undefined;
    reactTreeWalker(tree, visitor);

    const expected = { foo: 'bar' };
    expect(actual).toMatchObject(expected);
  });
});
