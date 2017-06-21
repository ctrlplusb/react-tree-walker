'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isPromise = undefined;
exports.default = reactTreeWalker;

var _react = require('react');

var defaultOptions = {
  componentWillUnmount: false

  // Lifted from https://github.com/sindresorhus/p-reduce
  // Thanks @sindresorhus!
}; /* eslint-disable no-console */

// Inspired by the awesome work done by the Apollo team.
// See https://github.com/apollostack/react-apollo/blob/master/src/server.ts
// This version has been adapted to be promise based.

// eslint-disable-next-line import/no-extraneous-dependencies
var pReduce = function pReduce(iterable, reducer, initVal) {
  return new Promise(function (resolve, reject) {
    var iterator = iterable[Symbol.iterator]();
    var i = 0;

    var next = function next(total) {
      var el = iterator.next();

      if (el.done) {
        resolve(total);
        return;
      }

      Promise.all([total, el.value]).then(function (value) {
        // eslint-disable-next-line no-plusplus
        next(reducer(value[0], value[1], i++));
      }).catch(reject);
    };

    next(initVal);
  });
};

// Lifted from https://github.com/sindresorhus/p-map-series
// Thanks @sindresorhus!
var pMapSeries = function pMapSeries(iterable, iterator) {
  var ret = [];

  return pReduce(iterable, function (a, b, i) {
    return Promise.resolve(iterator(b, i)).then(function (val) {
      ret.push(val);
    });
  }).then(function () {
    return ret;
  });
};

var isPromise = exports.isPromise = function isPromise(x) {
  return x != null && typeof x.then === 'function';
};

// Recurse an React Element tree, running visitor on each element.
// If visitor returns `false`, don't call the element's render function
// or recurse into its child elements
function reactTreeWalker(element, visitor, context) {
  var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : defaultOptions;

  return new Promise(function (resolve) {
    var doVisit = function doVisit(getChildren, visitorResult, childContext) {
      var doTraverse = function doTraverse(shouldContinue) {
        if (!shouldContinue) {
          // We recieved a false, which indicates a desire to stop traversal.
          resolve();
        }

        var child = getChildren();
        var theChildContext = typeof childContext === 'function' ? childContext() : childContext;

        if (child == null) {
          // If no children then we can't traverse.  We've reached the leaf.
          resolve();
        } else if (_react.Children.count(child)) {
          // If its a react Children collection we need to breadth-first
          // traverse each of them.
          var mapper = function mapper(aChild) {
            return aChild ? reactTreeWalker(aChild, visitor, theChildContext, options) : undefined;
          };
          // pMapSeries allows us to do depth-first traversal. Thanks @sindresorhus!
          pMapSeries(_react.Children.map(child, function (cur) {
            return cur;
          }), mapper).then(resolve);
        } else {
          // Otherwise we pass the individual child to the next recursion.
          reactTreeWalker(child, visitor, theChildContext, options).then(resolve);
        }
      };

      if (visitorResult === false) {
        // Visitor returned false, indicating a desire to not traverse.
        resolve();
      } else if (isPromise(visitorResult)) {
        // We need to execute the result and pass it's result through to our
        // continuer.
        visitorResult.then(doTraverse).catch(function (e) {
          console.log('Error occurred in Promise based visitor result provided to react-tree-walker.');
          if (e) {
            console.log(e);
            if (e.stack) {
              console.log(e.stack);
            }
          }
        });
      } else {
        doTraverse(true);
      }
    };

    // Is this element a Component?
    if (typeof element.type === 'function') {
      var Component = element.type;
      var props = Object.assign({}, Component.defaultProps, element.props);

      // Is this a class component? (http://bit.ly/2j9Ifk3)
      var isReactClassComponent = Component.prototype && (Component.prototype.isReactComponent || Component.prototype.isPureReactComponent);

      if (isReactClassComponent) {
        // React class component

        var instance = new Component(props, context);

        // In case the user doesn't pass these to super in the constructor
        instance.props = instance.props || props;
        instance.context = instance.context || context;

        // Make the setState synchronous.
        instance.setState = function (newState) {
          instance.state = Object.assign({}, instance.state, newState);
        };

        doVisit(function () {
          // Call componentWillMount if it exists.
          if (instance.componentWillMount) {
            instance.componentWillMount();
          }

          var children = instance.render();

          if (options.componentWillUnmount && instance.componentWillUnmount) {
            try {
              instance.componentWillUnmount();
            } catch (err) {
              // This is an experimental feature, we don't want to break
              // the bootstrapping process, but lets warn the user it
              // occurred.
              console.warn('Error calling componentWillUnmount whilst walking your react tree');
              console.warn(err);
            }
          }

          return children;
        }, visitor(element, instance, context), function () {
          return (
            // Ensure the child context is initialised if it is available. We will
            // need to pass it down the tree.
            instance.getChildContext ? Object.assign({}, context, instance.getChildContext()) : context
          );
        });
      } else {
        // Stateless Functional Component
        doVisit(function () {
          return Component(props, context);
        }, visitor(element, null, context), context);
      }
    } else {
      // This must be a basic element, such as a string or dom node.
      doVisit(function () {
        return element.props && element.props.children ? element.props.children : undefined;
      }, visitor(element, null, context), context);
    }
  }).catch(function (err) {
    // We don't want errors to be swallowed!
    console.error('Error walking your react tree');
    console.error(err);
  });
}