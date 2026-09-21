import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// jsdom has no object URLs.
let counter = 0;
URL.createObjectURL = () => `blob:test-${(counter += 1)}`;
URL.revokeObjectURL = () => {};
