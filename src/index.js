// Inspired by the awesome work done by the Apollo team.
// See https://github.com/apollostack/react-apollo/blob/master/src/server.ts
// This version has been adapted to be promise based.

// eslint-disable-next-line import/no-extraneous-dependencies
import { Children } from 'react';
import pMapSeries from 'p-map-series';

export const isPromise = x => x != null && typeof x.then === 'function';

// Recurse an React Element tree, running visitor on each element.
// If visitor returns `false`, don't call the element's render function
//   or recurse into its child elements
export default function reactTreeWalker(element, visitor, context) {
  return new Promise((resolve) => {
    const handleVisitResult = (getChild, visitorResult, childContext, isChildren) => {
      const tryContinue = () => {
        // Returned true, indicating a desire to continue traversal immediately.
        const child = getChild();

        if (child == null) {
          resolve();
        } else if (isChildren) {
          const mapper = aChild => (
            aChild
              ? reactTreeWalker(aChild, visitor, childContext)
              : undefined
          );
          pMapSeries(Children.map(child, cur => cur), mapper).then(resolve);
        } else {
          reactTreeWalker(child, visitor, childContext).then(resolve);
        }
      };

      if (visitorResult === false) {
        // Visitor returned false, indicating a desire to not traverse.
        resolve();
      } else if (isPromise(visitorResult)) {
        visitorResult.then(tryContinue);
      } else {
        tryContinue();
      }
    };

    // Is this element a Component?
    if (typeof element.type === 'function') {
      const Component = element.type;
      const props = Object.assign({}, Component.defaultProps, element.props);
      let childContext = context;

      // Is this a class component? (http://bit.ly/2j9Ifk3)
      const isReactClassComponent = Component.prototype &&
        (Component.prototype.isReactComponent || Component.prototype.isPureReactComponent);

      if (isReactClassComponent) {
        const instanceFactory = () => {
          const instance = new Component(props, context);
          // In case the user doesn't pass these to super in the constructor
          instance.props = instance.props || props;
          instance.context = instance.context || context;

          // Make the setState synchronous.
          instance.setState = (newState) => {
            instance.state = Object.assign({}, instance.state, newState);
          };

          // Call componentWillMount if it exists.
          if (instance.componentWillMount) {
            instance.componentWillMount();
          }

          // Ensure the child context is initialised if it is available. We will
          // need to pass it down the tree.
          if (instance.getChildContext) {
            childContext = Object.assign({}, context, instance.getChildContext());
          }

          return instance;
        };

        const instance = instanceFactory();

        // Hit up our visitor!
        handleVisitResult(
          () => instance.render(),
          visitor(element, instance, context),
          childContext,
        );
      } else {
        // Stateless Functional Component

        // Hit up our visitor!
        handleVisitResult(
          () => Component(props, context),
          visitor(element, null, context),
          context,
        );
      }
    } else {
      // This must be a basic element, such as a string or dom node.

      // Hit up our visitor!
      handleVisitResult(
        () => (
          element.props && element.props.children
            ? element.props.children
            : undefined
        ),
        visitor(element, null, context),
        context,
        true,
      );
    }
  });
}
