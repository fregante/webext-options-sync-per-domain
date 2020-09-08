# webext-options-sync-per-domain [![][badge-gzip]][link-bundlephobia]

[badge-gzip]: https://img.shields.io/bundlephobia/minzip/webext-options-sync-per-domain.svg?label=gzipped
[link-bundlephobia]: https://bundlephobia.com/result?p=webext-options-sync-per-domain

> Helps you manage and autosave your extension's options, separately for each additional permission.

Prerequisites

- Your WebExtension’s options are managed by [webext-options-sync](https://github.com/fregante/webext-options-sync)
- Your WebExtension can be enabled on multiple optional domains, maybe via [webext-dynamic-content-scripts](https://github.com/fregante/webext-dynamic-content-scripts/blob/master/how-to-add-github-enterprise-support-to-web-extensions.md)
- Your users want to customize your extension’s options for each domain, independently.

In that case, `webext-options-sync-per-domain` extends `webext-options-sync` with these feature:

- Automatically detects new `origin` permissions
- Prepares a fresh set of options for each new origin
- Transparently serves the right set of options based on the current domain
- Adds a domain switcher on the options page — only if the user adds multiple origins

## Install

You can just download the [standalone bundle](https://packd.fregante.now.sh/webext-options-sync-per-domain@latest?name=OptionsSyncPerDomain) (it might take a minute to download) and include the file in your `manifest.json`, or:

```sh
npm install webext-options-sync-per-domain
npm remove  webext-options-sync # This is now included
```

## Usage

If you're following the [suggested setup](https://github.com/fregante/webext-options-sync#advanced-usage) for `webext-options-sync`, here are the changes you should make:

<table>
<th>Before
<th>After

<tr>
<td>

```js
// options-storage.js
import OptionsSync from 'webext-options-sync';
export default new OptionsSync({defaults, migrations});
```

<td>

```js
// options-storage.js
import OptionsSyncPerDomain from 'webext-options-sync-per-domain';
export const perDomainOptions = new OptionsSyncPerDomain({defaults, migrations});
export default perDomainOptions.getOptionsForOrigin();
```

</table>

Now `options-storage.js` will export the same old `OptionsSync` instance, but it will very depending on the current domain.

You'll also need to change 2 lines on the options page:

<table>
<th>Before
<th>After

<tr>
<td>

```js
// options.js in options.html
import optionsStorage from './options-storage';
optionsStorage.syncForm('form');
```

<td>

```js
// options.js in options.html
import {perDomainOptions} from './options-storage';
perDomainOptions.syncForm('form');
```

</table>

That's all! A domain switcher will only appear if the user adds new additional domains via `chrome.permissions.request()` or [webext-domain-permission-toggle](https://github.com/fregante/webext-domain-permission-toggle).

## Concepts

### Origins

Origins are what the browser calls each "website" permission; they look like `https://example.com` or `https://*.example.com/*`

### Domains

Domains are the same as origins, except it's a less ambiguous word and it's generally shown protocol-less: `example.com` or `*.example.com`

### Default

`webext-options-sync-per-domain` differentiates between origins that are part of `manifest.json` and origins added later via `chrome.permission.request()`. All `manifest.json` origins share the same options and these are considered the "default".

## API

#### const perDomainOptions = new OptionsSyncPerDomain(setup?)

##### setup

This is identical to the [`setup` in `webext-options-sync`](https://github.com/fregante/webext-options-sync#const-optionsstorage--new-optionssyncsetup)

#### perDomainOptions.syncForm(form)

This is identical to [`syncForm()` in `webext-options-sync`](https://github.com/fregante/webext-options-sync#optionsstoragesyncformform), but it will also:

- add a domain selector dropdown if the user enabled the extension on more origins
- switch the data of the form depending on the selected domain

If you want to customize the switcher or listen to its change, `await` this call and perform the changes after it runs. Example:

```js
// options.js
import {perDomainOptions} from './options-storage';

async initOptions() {
	await perDomainOptions.syncForm('form');

	// Update domain-dependent page content when the domain is changed
	const dropdown = document.querySelector('.OptionsSyncPerDomain-picker select');
	if (dropdown) {
		dropdown.addEventListener('change', () => {
			select('#personal-token-link')!.host = dropdown.value === 'default' ? 'github.com' : dropdown.value;
		});
	}
}

initOptions();
```

#### perDomainOptions.getOptionsForOrigin(origin?)

Returns an origin-specific instance of OptionsSync. If called from an extension page (background.js, options.html, etc) and without the parameter, it will use the default origin.

##### origin

Type: `string` <br>
Default: `location.origin` <br>
Example: `http://example.com`

#### perDomainOptions.getAllOrigins()

Returns a `Map` of the `OptionsSync` instances, one for each origin. The default origins are on the key `default` and the other ones are on keys that look like `domain.ext`

```js
const instances = perDomainOptions.getAllOrigins();

// Print the options of these 2 instances
console.log(await instances.get('default').getAll());
console.log(await instances.get('example.com').getAll());
```

## Related

### Permissions

- [webext-additional-permissions](https://github.com/fregante/webext-additional-permissions) - Get any optional permissions that users have granted you.
- [webext-dynamic-content-scripts](https://github.com/fregante/webext-dynamic-content-scripts) - Automatically registers your content_scripts on domains added via permission.request
- [webext-permissions-events-polyfill](https://github.com/fregante/webext-permissions-events-polyfill) - Polyfill for `onAdded` and `onRemoved` permission events for Firefox.

### Others

- [webext-options-sync](https://github.com/fregante/webext-options-sync) - Helps you manage and autosave your extension's options. Chrome and Firefox.
- [webext-storage-cache](https://github.com/fregante/webext-storage-cache) - Map-like promised cache storage with expiration. Chrome and Firefox
- [webext-detect-page](https://github.com/fregante/webext-detect-page) - Detects where the current browser extension code is being run. Chrome and Firefox.
- [Awesome-WebExtensions](https://github.com/fregante/Awesome-WebExtensions) - A curated list of awesome resources for WebExtensions development.

## License

MIT © [Federico Brigante](https://bfred.it)
