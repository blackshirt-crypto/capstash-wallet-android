/**
 * @format
 */
import 'react-native-get-random-values'; // crypto.getRandomValues polyfill — MUST be first
import 'text-encoding';  // TextEncoder polyfill for QR code
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
AppRegistry.registerComponent(appName, () => App);
