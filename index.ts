// First line of app JavaScript: start the cold-start clock (see src/ui/startup.ts).
(globalThis as { __nnStart?: number }).__nnStart = Date.now();

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
