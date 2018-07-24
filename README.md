### Disclaimer

This library does not operate in an idiomatic manner against React. It makes some assumptions about the internals of React and makes calls against Components directly. This is a risk as it likely to break with future releases of React, i.e. the upcoming Suspense release.

Personally, I've found this library helpful in providing me with a solution for my server side rendering data fetching needs. That being said I very much look forward to being able to move over to Suspense as soon as it is stable and avoid having to use hacks/workarounds such as this library.

Please consider carefully before adopting this library. If you are happy to take on the risk I would recommend you write an abstraction over it that will allow you to easily remove/replace it from your codebase with Suspense or another more idiomatic solution.

----


# react-tree-walker 🌲

Walk a React (or Preact) element tree, executing a "visitor" function against each element.

[![npm](https://img.shields.io/npm/v/react-tree-walker.svg?style=flat-square)](http://npm.im/react-tree-walker)
[![MIT License](https://img.shields.io/npm/l/react-tree-walker.svg?style=flat-square)](http://opensource.org/licenses/MIT)
[![Travis](https://img.shields.io/travis/ctrlplusb/react-tree-walker.svg?style=flat-square)](https://travis-ci.org/ctrlplusb/react-tree-walker)
[![Codecov](https://img.shields.io/codecov/c/github/ctrlplusb/react-tree-walker.svg?style=flat-square)](https://codecov.io/github/ctrlplusb/react-tree-walker)

## TOCs

* [Introduction](#introduction)
* [Illustrative Example](#illustrative-example)
* [Order of Execution](#order-of-execution)
* [API](#api)

## Introduction

Inspired/lifted from the awesome [`react-apollo`](https://github.com/apollostack/react-apollo) project. 😗

This modified version expands upon the design, making it `Promise` based, allowing the visitor to return a `Promise`, which would subsequently delay the tree walking until the `Promise` is resolved. The tree is still walked in a depth-first fashion.

With this you could, for example, perform pre-rendering parses on your React element tree to do things like data prefetching. Which can be especially helpful when dealing with declarative APIs such as the one provided by React Router 4.

# Illustrative Example

In the below example we will create a visitor that will walk a React application, looking for any "class" component that has a `getData` method on it. We will then execute the `getData` function, storing the results into an array.

```jsx
import reactTreeWalker from 'react-tree-walker'

class DataFetcher extends React.Component {
  constructor(props) {
    super(props)
    this.getData = this.getData.bind(this)
  }

  getData() {
    // Supports promises! You could call an API for example to fetch some
    // data, or do whatever "bootstrapping" you desire.
    return Promise.resolve(this.props.id)
  }

  render() {
    return <div>{this.props.children}</div>
  }
}

const app = (
  <div>
    <h1>Hello World!</h1>
    <DataFetcher id={1} />
    <DataFetcher id={2}>
      <DataFetcher id={3}>
        <DataFetcher id={4} />
      </DataFetcher>
    </DataFetcher>
    <DataFetcher id={5} />
  </div>
)

const values = []

// You provide this! See the API docs below for full details.
function visitor(element, instance) {
  if (instance && typeof instance.getData) {
    return instance.getData().then(value => {
      values.push(value)
      // Return "false" to indicate that we do not want to visit "3"'s children,
      // therefore we do not expect "4" to make it into our values array.
      return value !== 3
    })
  }
}

reactTreeWalker(app, visitor)
  .then(() => {
    console.log(values) // [1, 2, 3, 5];
    // Now is a good time to call React's renderToString whilst exposing
    // whatever values you built up to your app.
  })
  // since v3.0.0 you need to do your own error handling!
  .catch(err => console.error(err))
```

Not a particularly useful piece of code, but hopefully it is illustrative enough as to indicate the posibilities. One could use this to warm a cache or a `redux` state, subsequently performing a `renderToString` execution with all the required data in place.

## Order of Execution

`react-tree-walker` walks your React application in a depth-first fashion, i.e. from the top down, visiting each child until their are no more children available before moving on to the next element. We can illustrate this behaviour using the below example:

```jsx
<div>
  <h1>Foo</h1>
  <section>
    <p>One</p>
    <p>Two</p>
  </section>
  <Footer />
</div>
```

In this example the order of elements being visited would be:

    div -> h1 -> "Foo" -> section -> p -> "One" -> p -> "Two" -> Footer

Whilst your application is being walked its behaviour will be much the same as if it were being rendered on the server - i.e. the `componentWillMount` lifecycle will be executed for any "class" components, and context provided by any components will be passed down and become available to child components.

Despite emulating a server side render, the tree walking process is far cheaper as it doesn't actually perform any rendering of the element tree to a string. It simply interogates your app building up an object/element tree. The really expensive cycles will likely be the API calls that you make. 😀

That being said you do have a bail-out ability allowing you to suspend the traversal down a branch of the tree. To do so you simply need to return `false` from your visitor function, or if returning a `Promise` ensure that the `Promise` resolves a `false` for the same behaviour.

## API

The API is very simple at the moment, only exposing a single function. We will describe the API of the `reactTreeWalker` function below as well as the API for the `visitor` function that `reactTreeWalker` expects as a parameter.

---

### **reactTreeWalker**

The default export of the library. The function that performs the magic.

```javascript
const reactTreeWalker = require('react-tree-walker')
```

_or_

```javascript
import reactTreeWalker from 'react-tree-walker'
```

**Parameters**

* **tree** (React/Preact element, _required_)

  The react application you wish to walk.

  e.g. `<div>Hello world</div>`

* **visitor** (`Function`, _required_)

  The function you wish to execute against _each_ element that is walked on the `tree`.

  See its [API docs](#visitor) below.

* **context** (`Object`, _optional_)

  Any root context you wish to provide to your application.

  e.g. `{ myContextItem: 'foo' }`

* **options** (`Object`, _optional_)

  Additional options/configuration. It currently supports the following values:

  * _componentWillUnmount_: Enable this to have the `componentWillUnmount` lifecycle event be executed whilst walking your tree. Defaults to `false`. This was added as an experimental additional flag to help with applications where they have critical disposal logic being executed within the `componentWillUnmount` lifecycle event.

**Returns**

A `Promise` that resolves when the tree walking is completed.

---

### **visitor**

The function that you create and provide to `reactTreeWalker`.

It should encapsulates the logic you wish to execute against each element.

**Parameters**

* **element** (React/Preact element, _required_)

  The current element being walked.

* **instance** (Component Instance, _optional_)

  If the current element being walked is a "class" Component then this will contain the instance of the Component - allowing you to interface with its methods etc.

* **context** (`Object`, _required_)

  The React context that is available to the current element. `react-tree-walker` emulates React in exposing context down the tree.

* **childContext** (`Object`, _optional_)

  If the current element being walked is a "class" Component and it exposes additional "child" context (via the `getChildContext` method) then this will contain the context that is being provided by the component instance.

**Returns**

If you return `false` then the children of the current element will not be visited.

e.g.

```javascript
function visitor(element) {
  if (element.type === 'menu') {
    // We will not traverse the children for any <menu /> nodes
    return 'false'
  }
}
```

You can also return a `Promise` which will cause the tree walking to wait for the `Promise` to be resolved before attempting to visit the children for the current element.

```javascript
function visitor(element, instance) {
  // This will make every visit take 1 second to execution.
  return new Promise(resolve => setTimeout(resolve, 1000))
}
```

You can make the Promise resolve a `false` to indicate that you do not want the children of the current element to be visited.

```javascript
function visitor(element, instance) {
  // Only the first element will be executed, and it will take 1 second to complete.
  return (
    new Promise(resolve => setTimeout(resolve, 1000))
      // This prevents any walking down the current elements children
      .then(() => false)
  )
}
```
