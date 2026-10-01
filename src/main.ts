import './styles.css';
import { App } from './app/App';
import { IntroScreen } from './ui/screens/IntroScreen';

const app = new App();
app.show(new IntroScreen(app));
app.start();

// хук для автотестів / налагодження: відкрийте гру з ?debug
if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { __app: App }).__app = app;
