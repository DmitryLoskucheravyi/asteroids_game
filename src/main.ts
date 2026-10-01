import './styles.css';
import { App } from './app/App';
import { Save } from './core/storage';
import { IntroScreen } from './ui/screens/IntroScreen';

const app = new App();
app.show(new IntroScreen(app));
app.start();

// хук для автотестів / налагодження: відкрийте гру з ?debug
if (import.meta.env.DEV || location.search.includes('debug')) Object.assign(window, { __app: app, __save: Save });
