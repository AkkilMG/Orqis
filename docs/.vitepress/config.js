import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Orqis',
  description: 'Structured async task orchestration for Node.js — concurrency control, cancellation, retries, task groups, and observability hooks.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/core-concepts', activeMatch: '/guide/' },
      { text: 'Plugins', link: '/plugins/overview', activeMatch: '/plugins/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      { text: 'Wiki', link: '/wiki/', activeMatch: '/wiki/' },
      { text: 'Meta', link: '/meta/comparison', activeMatch: '/meta/' },
    ],

    sidebar: {
      '/intro/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Quick Start', link: '/intro/quickstart' },
            { text: 'Installation', link: '/intro/install' },
          ],
        },
      ],

      '/guide/': [
        {
          text: 'Guides',
          items: [
            { text: 'Core Concepts', link: '/guide/core-concepts' },
            { text: 'Recipes', link: '/guide/recipes' },
            { text: 'Testing', link: '/guide/testing' },
            { text: 'Migration Guide', link: '/guide/migration' },
          ],
        },
      ],

      '/plugins/': [
        {
          text: 'Plugins',
          items: [
            { text: 'Plugin System', link: '/plugins/overview' },
            { text: 'Built-in Plugins', link: '/plugins/built-in' },
            { text: 'Custom Plugins', link: '/plugins/custom-plugins' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'TaskQueue', link: '/api/task-queue' },
            { text: 'TaskGroup', link: '/api/task-group' },
            { text: 'Events', link: '/api/events' },
          ],
        },
      ],

      '/wiki/': [
        {
          text: 'Wiki',
          items: [
            { text: 'Home', link: '/wiki/' },
            { text: 'FAQ', link: '/wiki/faq' },
            { text: 'Troubleshooting', link: '/wiki/troubleshooting' },
            { text: 'Common Errors', link: '/wiki/common-errors' },
            { text: 'Patterns & Pitfalls', link: '/wiki/patterns-and-pitfalls' },
            { text: 'Environment Compatibility', link: '/wiki/environment-compatibility' },
            { text: 'Changelog Notes', link: '/wiki/changelog-notes' },
          ],
        },
      ],

      '/meta/': [
        {
          text: 'Meta',
          items: [
            { text: 'Comparison', link: '/meta/comparison' },
            { text: 'Roadmap', link: '/meta/roadmap' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/AkkilMG/orqis' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Akkil M G',
    },

    editLink: {
      pattern: 'https://github.com/AkkilMG/orqis/edit/main/docs/:path',
    },
  },
})
