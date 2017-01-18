# react-tree-walker 🌲

Walk a React element tree, executing a provided visitor function against each element.

[![npm](https://img.shields.io/npm/v/react-tree-walker.svg?style=flat-square)](http://npm.im/react-tree-walker)
[![MIT License](https://img.shields.io/npm/l/react-tree-walker.svg?style=flat-square)](http://opensource.org/licenses/MIT)
[![Travis](https://img.shields.io/travis/ctrlplusb/react-tree-walker.svg?style=flat-square)](https://travis-ci.org/ctrlplusb/react-tree-walker)
[![Codecov](https://img.shields.io/codecov/c/github/ctrlplusb/react-tree-walker.svg?style=flat-square)](https://codecov.io/github/ctrlplusb/react-tree-walker)

## TOCs

  - [Introduction](#introduction)
  - [Example](#example)
  - [FAQs](#faqs)

## Introduction

This is a extract of the implementation within the awesome [`react-apollo`](https://github.com/apollostack/react-apollo) project. I've come to find many use-cases for it in my own projects and want to avoid code duplication.

With this you could, for example, perform pre-rendering parses on your React element tree to do things like data prefetching. 🤛

# Example

In the below example we walk the tree and execute the `getValue` function on every element instance that has the function available.  We then push the value into a values array.

```jsx
import reactTreeWalker from 'react-tree-walker';

class Foo extends React.Component {
  constructor(props) {
    super(props);
    this.getValue = this.getValue.bind(this);
  }

  getValue() {
    return this.props.value;
  }

  render() {
    return <div>{this.props.children}</div>;
  }
}

const app = (
  <div>
    <h1>Hello World!</h1>
    <Foo value={1} />
    <Foo value={2}>
      <Foo value={4}>
        <Foo value={5} />
      </Foo>
    </Foo>
    <Foo value={3} />
  </div>
);

const values = [];

/**
 * Visitor to be executed on each element being walked.
 *
 * @param  element - The current element being walked.
 * @param  instance - If the current element is a Component or PureComponent
 *                    then this will hold the reference to the created
 *                    instance. For any other element type this will be null.
 * @param  context - The current "React Context". Any provided childContexTypes
 *                   will be passed down the tree.
 *
 * @return `undefined` if you want to continue walking down the current branch,
 *         or return `false` if you wish to stop the traversal down the
 *         current branch.  Stopping the traversal can be quite handy if
 *         you want to resolve a Promise for example.  You can wait for the
 *         Promise to resolve and then execute a function to continue
 *         traversal of the branch where you left off.
 */
function visitor(element, instance, context) {
  if (instance && typeof instance.getValue) {
    values.push(instance.getValue());
  }
};

reactTreeWalker(tree, visitor);

console.log(values); // [1, 2, 4, 5, 3];
```

## FAQs

> Let me know if you have any...
