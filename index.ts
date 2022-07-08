import mem from 'mem';
import {patternToRegex} from 'webext-patterns';
import OptionsSync, {Options, Setup} from 'webext-options-sync';
import {isBackgroundPage, isContentScript} from 'webext-detect-page';
import {getAdditionalPermissions, getManifestPermissionsSync} from 'webext-additional-permissions';

// Export OptionsSync so that OptionsSyncPerDomain users can use it in `options-storage` without depending on it directly

export * from 'webext-options-sync';

/** Ensures that only the base storage name (i.e. without domain) is used in functions that require it */
type BaseStorageName = string;

// Memoized to have it evaluate once
const defaultOrigins = mem(() => patternToRegex(...getManifestPermissionsSync().origins));

// TODO: this shouldn't memoize calls across instances
function memoizeMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Target should be OptionsSyncPerDomain<UserOptions>, but decorators don't pass around the generic
	descriptor.value = mem(target[propertyKey]!);
}

function parseHost(origin: string): string {
	return origin.includes('//') ? origin.split('/')[2]!.replace('*.', '') : origin;
}

export default class OptionsSyncPerDomain<UserOptions extends Options> {
	static readonly migrations = OptionsSync.migrations;

	readonly #defaultOptions: Readonly<Setup<UserOptions> & {storageName: BaseStorageName}>;

	constructor(options: Setup<UserOptions>) {
		// Apply defaults
		this.#defaultOptions = {
			...options,
			storageName: options.storageName ?? 'options',
		};

		if (!isBackgroundPage()) {
			return;
		}

		// Run migrations for every origin
		// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
		if (options.migrations?.length! > 0) {
			this.getAllOrigins();
		}

		// Delete stored options when permissions are removed
		chrome.permissions.onRemoved.addListener(({origins}) => {
			const storageKeysToRemove = (origins ?? [])
				.filter(key => !defaultOrigins().test(key))
				.map(key => this.getStorageNameForOrigin(key));

			chrome.storage.sync.remove(storageKeysToRemove);
		});
	}

	@memoizeMethod
	getOptionsForOrigin(origin = location.origin): OptionsSync<UserOptions> {
		// Extension pages should always use the default options as base
		if (!origin.startsWith('http') || defaultOrigins().test(origin)) {
			return new OptionsSync(this.#defaultOptions);
		}

		return new OptionsSync({
			...this.#defaultOptions,
			storageName: this.getStorageNameForOrigin(origin),
		});
	}

	@memoizeMethod
	async getAllOrigins(): Promise<Map<string, OptionsSync<UserOptions>>> {
		if (isContentScript()) {
			throw new Error('This function only works on extension pages');
		}

		const instances = new Map<string, OptionsSync<UserOptions>>();
		instances.set('default', this.getOptionsForOrigin());

		const {origins} = await getAdditionalPermissions({strictOrigins: false});
		for (const origin of origins) {
			instances.set(
				parseHost(origin),
				this.getOptionsForOrigin(origin),
			);
		}

		return instances;
	}

	async syncForm(form: string | HTMLFormElement): Promise<void> {
		if (isContentScript()) {
			throw new Error('This function only works on extension pages');
		}

		if (typeof form === 'string') {
			form = document.querySelector<HTMLFormElement>(form)!;
		}

		// Start synching the default options
		await this.getOptionsForOrigin().syncForm(form);

		// Look for other origins
		const optionsByOrigin = await this.getAllOrigins();
		if (optionsByOrigin.size === 1) {
			return;
		}

		// Create domain picker
		const dropdown = document.createElement('select');
		dropdown.addEventListener('change', this._domainChangeHandler.bind(this));
		for (const domain of optionsByOrigin.keys()) {
			const option = document.createElement('option');
			option.value = domain;
			option.textContent = domain;
			dropdown.append(option);
		}

		// Wrap and prepend to form
		const wrapper = document.createElement('p');
		wrapper.append('Domain selector: ', dropdown);
		wrapper.classList.add('OptionsSyncPerDomain-picker');
		form.prepend(wrapper, document.createElement('hr'));
	}

	private getStorageNameForOrigin(origin: string): string {
		return this.#defaultOptions.storageName + '-' + parseHost(origin);
	}

	private async _domainChangeHandler(event: Event): Promise<void> {
		const dropdown = event.currentTarget as HTMLSelectElement;

		for (const [domain, options] of await this.getAllOrigins()) {
			if (dropdown.value === domain) {
				options.syncForm(dropdown.form!);
			} else {
				options.stopSyncForm();
			}
		}
	}
}

export {default as OptionsSync} from 'webext-options-sync';
