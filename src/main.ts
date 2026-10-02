import './styles.css';
import { App } from './app/App';
import { onUnauthorized } from './core/api';
import { Save } from './core/storage';
import { AuthScreen } from './ui/screens/AuthScreen';
import { IntroScreen } from './ui/screens/IntroScreen';

const app = new App();
app.show(new IntroScreen(app));
app.start();

// протермінований/недійсний токен під час гри — повертаємо на екран входу
onUnauthorized.add(() => app.show(new AuthScreen(app)));

// хук для автотестів / налагодження: відкрийте гру з ?debug
if (import.meta.env.DEV || location.search.includes('debug')) Object.assign(window, { __app: app, __save: Save });
