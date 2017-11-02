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

Originally inspired/lifted from the awesome [`react-apollo`](https://github.com/apollostack/react-apollo) project.

This modified version expands upon the design, making it `Promise` based, allowing the visitor to return a `Promise`, which would subsequently delay the tree walking until the `Promise` is resolved.  The tree is still walked in a depth-first fashion.

With this you could, for example, perform pre-rendering parses on your React element tree to do things like data prefetching. 🤛

# Example

In the below example we walk the tree and execute the `getValue` function on every element instance that has the function available.  We then push the value into a values array.

```jsx
import reactTreeWalker from 'react-tree-walker';

class Foo extends React.Component {
  constructor(props) {
    super(props);
    this.getData = this.getData.bind(this);
  }

  getData() {
    // Return a promise or a sync value  
    return Promise.resolve(this.props.value);
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
 * @return `true` to continue walking down the current branch,
 *         OR
 *         `false` if you wish to stop the traversal down the current branch,
 *         OR
 *         `Promise<true|false>` a promise that resolves to either true/false
 */
function visitor(element, instance, context) {
  if (instance && typeof instance.getData) {
    return instance.getData()
      .then((value) => {
        values.push(value);
        return value === 4
          // prevent traversing "4"'s children
          ? false
          : true
      })
  }
  return true
}

reactTreeWalker(app, visitor).then(() => {
  console.log(values); // [1, 2, 4, 3];
});

```

## FAQs

> Let me know if you have any...
