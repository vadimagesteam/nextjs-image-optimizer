import {defineConfig} from 'vitest/config';

export default defineConfig({
    esbuild: {
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment'
    },
    test: {
        include: ['src/__tests__/**/*.test.{ts,tsx}'],
        environment: 'node'
    }
});
