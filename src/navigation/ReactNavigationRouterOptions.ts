import type {NavigationProp, ParamListBase} from '@react-navigation/native';
import type {NavigationRouterOptions} from './NavigationRouterOptions';

/** Screens that can be opened without inventing required parameters. */
export type StaticRouteName<Params extends ParamListBase> = Extract<
  {
    [Name in keyof Params]: undefined extends Params[Name] ? Name : never;
  }[keyof Params],
  string
>;

/** Configuration for createReactNavigationRouter using the owning navigator. */
export interface ReactNavigationRouterOptions<
  Params extends ParamListBase,
> extends NavigationRouterOptions<StaticRouteName<Params>> {
  readonly navigation: Pick<NavigationProp<Params>, 'dispatch' | 'getState'>;
}
