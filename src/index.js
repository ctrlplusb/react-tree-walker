/* @flow */
// Extracted from: https://github.com/apollostack/react-apollo/blob/master/src/server.ts

// eslint-disable-next-line import/no-extraneous-dependencies
import { Children, Element } from 'react';

type React$Element = Element<*>;
type Context = { [key: string]: any; };
type ElementVisitor =
  (element: React$Element, instance: ?Function, context: Context) => boolean | void;

export const isPromise = (x : any) => typeof x === 'object' && typeof x.then === 'function';

// Recurse an React Element tree, running visitor on each element.
// If visitor returns `false`, don't call the element's render function
//   or recurse into its child elements
export default function reactTreeWalker(
  element: React$Element,
  visitor: ElementVisitor,
  context: Context = {},
) {
  // Is this element a Component?
  if (typeof element.type === 'function') {
    const Component = element.type;
    const props = Object.assign({}, Component.defaultProps, element.props);
    let childContext = context;
    let child;

    // Is this a class component? (http://bit.ly/2j9Ifk3)
    const isReactClassComponent = Component.prototype &&
      (Component.prototype.isReactComponent || Component.prototype.isPureReactComponent);

    if (isReactClassComponent) {
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

      // Hit up our visitor!
      if (visitor(element, instance, context) === false) {
        // Visitor returned false, indicating a desire to not traverse.
        return;
      }

      // Get the render output as the child.
      child = instance.render();
    } else {
      // Stateless Functional Component

      // Hit up our visitor!
      if (visitor(element, null, context) === false) {
        // Visitor returned false, indicating a desire to not traverse.
        return;
      }

      // Get the output for the function, as the child.
      child = Component(props, context);
    }

    // Only continue walking if a child exists.
    if (child) {
      reactTreeWalker(child, visitor, childContext);
    }
  } else {
    // This must be a basic element, such as a string or dom node.

    // Hit up our visitor!
    if (visitor(element, null, context) === false) {
      // Visitor returned false, indicating a desire to not traverse.
      return;
    }

    // If the element has children then we will walk them.
    if (element.props && element.props.children) {
      Children.forEach(element.props.children, (child: any) => {
        if (child) {
          reactTreeWalker(child, visitor, context);
        }
      });
    }
  }
}
