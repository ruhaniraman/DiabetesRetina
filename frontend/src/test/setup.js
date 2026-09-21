import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

afterEach(cleanup);

// jsdom has no object URLs.
let counter = 0;
URL.createObjectURL = () => `blob:test-${(counter += 1)}`;
URL.revokeObjectURL = () => {};

// Async queries (findBy*) get a generous window so slow CI/dev machines don't cause false failures.
configure({ asyncUtilTimeout: 5000 });
