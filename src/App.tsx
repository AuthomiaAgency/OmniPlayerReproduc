/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import MusicWidget from './components/MusicWidget';

export default function App() {
  return (
    <div className="w-full h-screen overflow-hidden bg-[var(--t-bg)] transition-colors duration-500">
      <MusicWidget />
    </div>
  );
}
