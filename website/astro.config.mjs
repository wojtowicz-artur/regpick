// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Regpick',
			customCss: [
				// Relative path to your custom CSS file
				'./src/styles/custom.css',
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/tebra-icon-registry/regpick' }], // Example URL, adjust if needed
			sidebar: [
				{
					label: 'Documentation',
					items: [
						{ label: 'How-to Guides', slug: 'how_to' },
						{ label: 'Configuration Reference', slug: 'configuration_reference' },
						{ label: 'Registry Format', slug: 'registry_format' },
						{ label: 'Command Stories', slug: 'commands_stories' },
						{ label: 'MVP Decisions', slug: 'mvp-decisions' },
					],
				},
			],
		}),
	],
});
