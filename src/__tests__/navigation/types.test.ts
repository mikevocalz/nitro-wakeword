import type {ImperativeRouter} from 'expo-router';
import type {NavigationProp} from '@react-navigation/native';
import type {ExpoNavigationRouterOptions} from '../../navigation/expo';
import type {
  ReactNavigationRouterOptions,
  StaticRouteName,
} from '../../navigation/reactNavigation';

type Screens = {
  Home: undefined;
  Settings: {tab?: string} | undefined;
  Profile: {id: string};
};

// Checked against the installed libraries, not handwritten navigation interfaces.
function typecheckPeers(
  expo: ImperativeRouter,
  navigation: NavigationProp<Screens>,
) {
  const expoOptions: ExpoNavigationRouterOptions = {
    router: expo,
    getSessionKey: () => 1,
    routes: [],
  };
  const nativeOptions: ReactNavigationRouterOptions<Screens> = {
    navigation,
    getSessionKey: () => 1,
    routes: [],
  };
  const allowed: StaticRouteName<Screens>[] = ['Home', 'Settings'];
  // @ts-expect-error Required route parameters are unsupported by the static adapter.
  const required: StaticRouteName<Screens> = 'Profile';
  // @ts-expect-error Unknown screens cannot enter a typed registry.
  const unknown: StaticRouteName<Screens> = 'Admin';
  // @ts-expect-error External URLs are not static Expo paths.
  const external: ExpoNavigationRouterOptions['routes'][number]['target'] =
    'https://example.com';
  return [expoOptions, nativeOptions, allowed, required, unknown, external];
}

it('keeps actual peer type checks in the TypeScript test surface', () => {
  expect(typeof typecheckPeers).toBe('function');
});
