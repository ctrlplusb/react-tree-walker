/* @flow */

// eslint-disable-next-line import/no-extraneous-dependencies
import { Children, Element } from 'react';

type React$Element = Element<*>;
type Context = { [key: string]: any; };
type ElementVisitor =
  (element: React$Element, instance: ?Function, context: Context) => boolean | void;

// Recurse an React Element tree, running visitor on each element.
// If visitor returns `false`, don't call the element's render function
//   or recurse into its child elements
export default function reactTreeWalker(
  element: React$Element,
  visitor: ElementVisitor,
  context: Context = {},
) {
  const Component = element.type;

  // a stateless functional component or a class
  if (typeof Component === 'function') {
    const props = Object.assign({}, Component.defaultProps, element.props);
    let childContext = context;
    let child;

    // Are we are a react class?
    // http://bit.ly/2j9Ifk3
    const isReactClassComponent = Component.prototype &&
      (Component.prototype.isReactComponent || Component.prototype.isPureReactComponent);

    if (isReactClassComponent) {
      const instance = new Component(props, context);
      // In case the user doesn't pass these to super in the constructor
      instance.props = instance.props || props;
      instance.context = instance.context || context;

      // Override setState to just change the state, not queue up an update.
      //   (we can't do the default React thing as we aren't mounted "properly"
      //   however, we don't need to re-render as well only support setState in
      //   componentWillMount, which happens *before* render).
      instance.setState = (newState) => {
        instance.state = Object.assign({}, instance.state, newState);
      };

      if (instance.componentWillMount) {
        instance.componentWillMount();
      }

      if (instance.getChildContext) {
        childContext = Object.assign({}, context, instance.getChildContext());
      }

      if (visitor(element, instance, context) === false) {
        return;
      }

      child = instance.render();
    } else { // just a stateless functional
      if (visitor(element, null, context) === false) {
        return;
      }

      child = Component(props, context);
    }

    if (child) {
      reactTreeWalker(child, visitor, childContext);
    }
  } else { // a basic string or dom element, just get children
    if (visitor(element, null, context) === false) {
      return;
    }

    if (element.props && element.props.children) {
      Children.forEach(element.props.children, (child: any) => {
        if (child) {
          reactTreeWalker(child, visitor, context);
        }
      });
    }
  }
}
