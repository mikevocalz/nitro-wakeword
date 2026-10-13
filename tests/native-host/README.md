# Native integration host

This bare React Native 0.87.1 app is a build fixture for the local package's real
Nitro bindings on iOS and Android. It uses React 19.2.3, Nitro 0.37.1 and the
React Native Community CLI/template 20.2.0 / 0.87.1.

Run the root build first, then `npm ci --ignore-scripts` here. The local package
is a linked dependency of this fixture; Metro resolves one React/Nitro copy from
this app's node_modules. The root package remains independently installable.

The screen checks a rejected empty-model configuration and awaited cleanup.
It never requests microphone permission or loads model weights. Building this
app does not prove the screen was executed; report compile, link and simulator
execution separately. This fixture is not the planned product example UI.

Generated native project files derive from the MIT-licensed
[React Native Community template](https://github.com/react-native-community/template),
version 0.87.1. Keep its license with this fixture.
