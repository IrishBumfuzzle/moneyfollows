import { LocationScreen } from './screens/LocationScreen';

export function App() {
  return <LocationScreen onSelect={(id) => console.log('go to', id)} />;
}
