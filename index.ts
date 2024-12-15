import {memoizeDecorator} from 'memoize';
import {patternToRegex} from 'webext-patterns';
import OptionsSync, {type Options, type Setup} from 'webext-options-sync';
import {isBackgroundPage, isContentScript} from 'webext-detect';
import {
	queryAdditionalPermissions,
	normalizeManifestPermissions,
} from 'webext-permissions';

// Export OptionsSync so that OptionsSyncPerDomain users can use it in `options-storage` without depending on it directly
export * from 'webext-options-sync';
export {default as OptionsSync} from 'webext-options-sync';

/** Ensures that only the base storage name (i.e. without domain) is used in functions that require it */
type BaseStorageName = string;

function parseHost(origin: string): string {
	return origin.includes('//')
		? origin.split('/')[2]!.replace('*.', '')
		: origin;
}

export type SyncedForm = Readonly<{
	domainCount: number;
	getSelectedDomain: () => string;
	onChange(callback: (domain: string) => void): void;
}>;

export default class OptionsSyncPerDomain<UserOptions extends Options> {
	static readonly migrations = OptionsSync.migrations;

	readonly #defaultOrigins = patternToRegex(...normalizeManifestPermissions().origins);

	readonly #defaultOptions: Readonly<Setup<UserOptions> & {storageName: BaseStorageName}>;

	#syncedForm: OptionsSync<UserOptions> | undefined;

	readonly #changeEventTarget = new EventTarget();

	constructor(options: Setup<UserOptions>) {
		// Apply defaults
		this.#defaultOptions = {
			storageName: 'options',
			...options,
		};

		if (!isBackgroundPage()) {
			return;
		}

		// Run migrations for every origin
		if (options.migrations?.length) {
			this.getAllOrigins();
		}

		// Delete stored options when permissions are removed
		chrome.permissions.onRemoved.addListener(({origins}) => {
			const storageKeysToRemove = (origins ?? [])
				.filter(key => !this.#defaultOrigins.test(key))
				.map(key => this.getStorageNameForOrigin(key));

			chrome.storage.sync.remove(storageKeysToRemove);
		});
	}

	@memoizeDecorator()
	getOptionsForOrigin(origin = location.origin): OptionsSync<UserOptions> {
		// Extension pages should always use the default options as base
		if (!origin.startsWith('http') || this.#defaultOrigins.test(origin)) {
			return new OptionsSync(this.#defaultOptions);
		}

		return new OptionsSync({
			...this.#defaultOptions,
			storageName: this.getStorageNameForOrigin(origin),
		});
	}

	@memoizeDecorator()
	async getAllOrigins(): Promise<Map<string, OptionsSync<UserOptions>>> {
		if (isContentScript()) {
			throw new Error('This function only works on extension pages');
		}

		const instances = new Map<string, OptionsSync<UserOptions>>();
		instances.set('default', this.getOptionsForOrigin());

		for (const {domain, origin} of await this.getAdditionalOrigins()) {
			instances.set(
				domain,
				this.getOptionsForOrigin(origin),
			);
		}

		return instances;
	}

	async getAdditionalOrigins(): Promise<Array<{origin: string; domain: string}>> {
		const {origins} = await queryAdditionalPermissions({strictOrigins: false});
		return origins.map(origin => ({
			origin,
			domain: parseHost(origin),
		}));
	}

	async syncForm(form: string | HTMLFormElement) {
		if (isContentScript()) {
			throw new Error('This function only works on extension pages');
		}

		if (typeof form === 'string') {
			form = document.querySelector<HTMLFormElement>(form)!;
		}

		// Start synching the default options
		const currentOrigin = this.getOptionsForOrigin();
		await currentOrigin.syncForm(form);
		this.#syncedForm = currentOrigin;

		// Look for other origins
		const additionalOrigins = await this.getAdditionalOrigins();
		if (additionalOrigins.length === 0) {
			return Object.freeze({
				domainCount: 1,
				getSelectedDomain: () => 'default',
				onChange() {/* */},
			});
		}

		const allOrigins = ['default', ...additionalOrigins.map(item => item.domain)];
		// Create domain picker
		const dropdown = document.createElement('select');
		dropdown.addEventListener('change', this._domainChangeHandler);
		for (const domain of allOrigins) {
			const option = document.createElement('option');
			// TODO: Use origin as value instead of domain, this makes things more consistent
			option.value = domain;
			option.textContent = domain;
			dropdown.append(option);
		}

		// Wrap and prepend to form
		const wrapper = document.createElement('p');
		wrapper.append('Domain selector: ', dropdown);
		wrapper.classList.add('OptionsSyncPerDomain-picker');
		form.prepend(wrapper, document.createElement('hr'));

		return Object.freeze({
			domainCount: allOrigins.length,
			getSelectedDomain: () => dropdown.value,
			onChange: async (callback: (domain: string) => void): Promise<void> => {
				this.#changeEventTarget.addEventListener('change', () => {
					callback(dropdown.value);
				});
			},
		});
	}

	private getStorageNameForOrigin(origin: string): string {
		return this.#defaultOptions.storageName + '-' + parseHost(origin);
	}

	private readonly _domainChangeHandler = async (event: Event): Promise<void> => {
		const dropdown = event.currentTarget as HTMLSelectElement;

		this.#syncedForm!.stopSyncForm();
		await this.getOptionsForOrigin('https://*.' + dropdown.value + '/*').syncForm(dropdown.form!);
		this.#changeEventTarget.dispatchEvent(new Event('change'));
	};
}
