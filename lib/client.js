window.__ModuleLoader__.load({
  id: 'dsh-web-search-router',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const clientRuntime = require('@deepseek-ai/dsh-client-runtime/client')
    const uiPrimitives = require('@deepseek-ai/dsh-client-ui-primitives')

    const SETTINGS_ROUTE = '/api/plugins/web-search-router/settings'
    const NS = 'dsh-web-search-router'
    const SETTINGS_NAMESPACE = 'web-search-router'
    const SETTINGS_FIELDS = ['order', 'enabledProviders', 'timeoutMs', 'cooldownSeconds', 'fallbackOnEmpty', 'searxngBaseURL']
    const LOCALES = {
      zh: {
        title: 'Web Search Router',
        description: '按优先级路由 Web Search；不可用、限流或失败时自动切换下一项。',
        loading: '正在读取设置…', unsaved: '未保存', providers: '搜索提供方 · 从上到下尝试，成功即停止',
        configured: '可用/已配置', notConfigured: '未配置', providerSettings: '提供方设置',
        clear: '清除', clearPending: '保存后清除', keepKey: '已配置；留空保持不变', routingPolicy: '路由策略',
        timeout: '单提供方超时', cooldown: '429 / quota 冷却', fallbackOnEmpty: '空结果继续下一个', enabled: '启用',
        note: '排序、启停与路由策略保存到 DSH Settings；API Key 仅写入 DSH credentials。缺配置会自动跳过，429 / quota 会按设置冷却。',
        discard: '放弃', save: '保存', saving: '保存中…', moveUp: '上移', moveDown: '下移',
        readCredentialsFailed: '读取 credentials 状态失败', localOnly: '设置只能在本机 127.0.0.1 页面修改。',
        readSettingsFailed: '读取设置失败', atLeastOne: '至少保留一个搜索提供方。', saveFailed: '保存失败',
      },
      en: {
        title: 'Web Search Router',
        description: 'Route Web Search by priority; automatically fall back when a provider is unavailable, limited, or fails.',
        loading: 'Loading settings…', unsaved: 'Unsaved', providers: 'Search providers · tried top to bottom; first success wins',
        configured: 'Available/configured', notConfigured: 'Not configured', providerSettings: 'Provider settings',
        clear: 'Clear', clearPending: 'Will clear on save', keepKey: 'Configured; leave blank to keep', routingPolicy: 'Routing policy',
        timeout: 'Per-provider timeout', cooldown: '429 / quota cooldown', fallbackOnEmpty: 'Continue after empty result', enabled: 'Enabled',
        note: 'Order, enablement, and routing policy are stored in DSH Settings. API keys are written only to DSH credentials. Missing providers are skipped and 429/quota failures cool down automatically.',
        discard: 'Discard', save: 'Save', saving: 'Saving…', moveUp: 'Move up', moveDown: 'Move down',
        readCredentialsFailed: 'Could not read credential status', localOnly: 'Settings can only be changed from the local 127.0.0.1 page.',
        readSettingsFailed: 'Could not read settings', atLeastOne: 'Keep at least one search provider enabled.', saveFailed: 'Save failed',
      },
    }
    const PROVIDERS = [
      ['searxng', 'SearXNG'], ['deepseek', 'DeepSeek Search'], ['tavily', 'Tavily'], ['brave', 'Brave'],
      ['exa', 'Exa'], ['firecrawl', 'Firecrawl'], ['parallel', 'Parallel'], ['duckduckgo', 'DuckDuckGo'],
    ].map(([id, name]) => ({ id, name }))
    const IDS = PROVIDERS.map((item) => item.id)
    const DEFAULT_KEY_REFS = {
      deepseek: 'DEEPSEEK_API_KEY',
      tavily: 'TAVILY_API_KEY',
      brave: 'BRAVE_API_KEY',
      exa: 'EXA_API_KEY',
      firecrawl: 'FIRECRAWL_API_KEY',
      parallel: 'PARALLEL_API_KEY',
    }
    const TIMEOUT_OPTIONS = [5000, 10000, 15000, 30000]
    const COOLDOWN_OPTIONS = [60, 300, 900, 3600]

    function clone(value) { return JSON.parse(JSON.stringify(value)) }
    function apiValue(response) { return response?.result?.ok ? response.result.value : undefined }

    async function settingsRequest(method = 'GET', body) {
      const response = await fetch(SETTINGS_ROUTE, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Settings HTTP ${response.status}`)
      return data
    }

    function injectCss() {
      if (typeof document === 'undefined') return () => {}
      if (document.querySelector('style[data-web-search-router-css]')) return () => {}
      const tag = document.createElement('style')
      tag.dataset.webSearchRouterCss = '1'
      tag.textContent = [
        '.wsr-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}',
        '.wsr-head{width:100%;border:0;border-radius:12px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:14px 16px;display:flex;align-items:center;gap:12px}',
        '.wsr-titlebox{flex:1;min-width:0}.wsr-title{font-weight:600;font-size:15px;color:var(--dsw-alias-label-primary)}.wsr-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:3px}.wsr-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.wsr-chevronOpen{transform:rotate(180deg)}',
        '.wsr-dirty{font-size:11px;border-radius:999px;padding:2px 8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}',
        '.wsr-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:14px}.wsr-section{padding-top:14px}.wsr-sectionTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:8px}',
        '.wsr-provider{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l2)}.wsr-provider:first-of-type{border-top:0}',
        '.wsr-rank{display:flex;gap:4px}.wsr-rank button,.wsr-mini{border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;padding:2px 6px;font:inherit;font-size:12px}.wsr-rank button:disabled{opacity:.25;cursor:default}',
        '.wsr-pname{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}.wsr-pdetail{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:2px}',
        '.wsr-switch{position:relative;width:36px;height:20px}.wsr-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}.wsr-track{display:block;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-bg-module-platform)}.wsr-track:after{content:"";position:absolute;width:16px;height:16px;left:2px;top:2px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform .15s}.wsr-switch input:checked+.wsr-track{background:var(--dsw-alias-brand-primary)}.wsr-switch input:checked+.wsr-track:after{transform:translateX(16px);background:#fff}',
        '.wsr-field{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;align-items:center;padding:6px 0}.wsr-label{font-size:12px;color:var(--dsw-alias-label-secondary)}.wsr-input{width:100%;box-sizing:border-box;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:12px}.wsr-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
        '.wsr-keyrow{display:flex;gap:7px;align-items:center}.wsr-keyrow .wsr-input{flex:1}.wsr-note{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5;margin-top:8px}.wsr-error{font-size:12px;color:var(--dsw-alias-label-error);margin-right:auto}',
        '.wsr-footer{display:flex;gap:8px;align-items:center;justify-content:flex-end;border-top:1px solid var(--dsw-alias-border-l2);margin-top:14px;padding-top:12px}.wsr-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:none;color:var(--dsw-alias-label-secondary);padding:5px 13px;font:inherit;font-size:12px;cursor:pointer}.wsr-btnPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}.wsr-btn:disabled{opacity:.4;cursor:default}',
      ].join('')
      document.head.appendChild(tag)
      return () => {}
    }

    class RouterCardController {
      constructor(api, isLoopback, t, scope) {
        this.api = api
        this.isLoopback = isLoopback
        this.t = t
        this.scope = scope
        this.value = null
        this.draft = null
        this.credentialStatus = {}
        this.keyRefs = { ...DEFAULT_KEY_REFS }
        this.keyDraft = {}
        this.keyClear = {}
        this.saving = false
        this.error = ''
        this.store = clientRuntime.createSnapshotStore(this.project())
        this.unsubscribe = scope.subscribe(() => this.syncFromScope())
        this.syncFromScope(true)
        void this.refresh()
      }

      project() {
        const snapshot = this.scope.getSnapshot()
        return {
          value: this.draft,
          providers: PROVIDERS,
          credentialStatus: { ...this.credentialStatus },
          keyRefs: { ...this.keyRefs },
          keyDraft: { ...this.keyDraft },
          keyClear: { ...this.keyClear },
          saving: this.saving,
          error: this.error,
          dirty: this.isDirty(),
          editable: this.isLoopback && snapshot.status === 'ready' && snapshot.writable,
        }
      }

      isDirty() {
        if (!this.value || !this.draft) return false
        return JSON.stringify(this.value) !== JSON.stringify(this.draft)
          || Object.values(this.keyDraft).some((value) => String(value || '').trim())
          || Object.values(this.keyClear).some(Boolean)
      }

      publish() { this.store.set(this.project()) }

      syncFromScope(force = false) {
        const snapshot = this.scope.getSnapshot()
        if (snapshot.status !== 'ready' || !snapshot.value) {
          this.publish()
          return
        }
        if (force || (!this.saving && !this.isDirty())) {
          this.value = clone(snapshot.value)
          this.draft = clone(snapshot.value)
        }
        if (this.draft) this.credentialStatus.searxng = Boolean(this.draft.searxngBaseURL)
        this.credentialStatus.duckduckgo = true
        this.publish()
      }

      async credentialMap(refs = this.keyRefs) {
        const response = await this.api.credentials.describe({ refs: Object.values(refs) })
        const value = apiValue(response)
        if (!value) throw new Error(this.t('readCredentialsFailed'))
        return value.credentials || {}
      }

      async refresh() {
        try {
          const payload = await settingsRequest()
          this.keyRefs = { ...DEFAULT_KEY_REFS, ...(payload?.credentialRefs || {}) }
          const credentials = await this.credentialMap(this.keyRefs)
          const snapshot = this.scope.getSnapshot()
          if (snapshot.status === 'ready' && snapshot.value) {
            this.value = clone(snapshot.value)
            this.draft = clone(snapshot.value)
          }
          this.credentialStatus = Object.fromEntries(Object.entries(this.keyRefs).map(([id, ref]) => [id, Boolean(credentials[ref]?.configured)]))
          this.credentialStatus.searxng = Boolean(this.draft?.searxngBaseURL)
          this.credentialStatus.duckduckgo = true
          this.keyDraft = {}
          this.keyClear = {}
          this.error = this.isLoopback ? '' : this.t('localOnly')
        } catch (error) {
          this.error = error?.message ? String(error.message) : this.t('readSettingsFailed')
        }
        this.saving = false
        this.publish()
      }

      inject() {
        return {
          hooks: { routerCard: this.store },
          move: (id, delta) => this.move(id, delta),
          toggle: (id, enabled) => this.toggle(id, enabled),
          setField: (key, value) => this.setField(key, value),
          setKey: (id, value) => { this.keyDraft[id] = value; this.keyClear[id] = false; this.error = ''; this.publish() },
          clearKey: (id) => { this.keyDraft[id] = ''; this.keyClear[id] = true; this.error = ''; this.publish() },
          discard: () => this.refresh(),
          save: () => this.save(),
        }
      }

      move(id, delta) {
        const order = [...this.draft.order]
        const index = order.indexOf(id)
        const target = index + delta
        if (index < 0 || target < 0 || target >= order.length) return
        ;[order[index], order[target]] = [order[target], order[index]]
        this.draft.order = order
        this.publish()
      }

      toggle(id, enabled) {
        const set = new Set(this.draft.enabledProviders)
        enabled ? set.add(id) : set.delete(id)
        if (!set.size) {
          this.error = this.t('atLeastOne')
          this.publish()
          return
        }
        this.draft.enabledProviders = IDS.filter((value) => set.has(value))
        this.error = ''
        this.publish()
      }

      setField(key, value) {
        if (key === 'timeoutMs' || key === 'cooldownSeconds') this.draft[key] = Number(value)
        else if (key === 'fallbackOnEmpty') this.draft[key] = Boolean(value)
        else this.draft[key] = value
        this.error = ''
        this.publish()
      }

      async writeCredential(ref, value, clear) {
        const response = value
          ? await this.api.credentials.set({ ref, value })
          : clear
            ? await this.api.credentials.unset({ ref })
            : null
        if (response && !response.result?.ok) throw new Error(`${this.t('saveFailed')}: ${ref} (${response.result?.error?.code || 'unknown'})`)
      }

      async save() {
        if (!this.draft || this.saving || !this.project().editable) return
        const settings = clone(this.draft)
        const keyDraft = { ...this.keyDraft }
        const keyClear = { ...this.keyClear }
        this.saving = true
        this.error = ''
        this.publish()
        try {
          for (const field of SETTINGS_FIELDS) {
            if (JSON.stringify(this.value?.[field]) !== JSON.stringify(settings[field])) {
              await this.scope.set(field, settings[field])
            }
          }
          for (const [id, ref] of Object.entries(this.keyRefs)) {
            await this.writeCredential(ref, String(keyDraft[id] || '').trim(), Boolean(keyClear[id]))
          }
          await this.refresh()
        } catch (error) {
          this.error = error?.message ? String(error.message) : this.t('saveFailed')
          this.saving = false
          this.publish()
        }
      }
    }

    function field(e, label, input) {
      return e('div', { className: 'wsr-field' }, e('span', { className: 'wsr-label' }, label), input)
    }

    function RouterCard(props) {
      const e = React.createElement
      const state = props.useRouterCard((value) => value)
      const t = props.t
      const [open, setOpen] = React.useState(false)
      if (!state.value) {
        return e('li', { className: 'wsr-card' }, e('button', { className: 'wsr-head', type: 'button', onClick: () => setOpen(!open) },
          e('span', { className: 'wsr-titlebox' }, e('span', { className: 'wsr-title' }, t('title')), e('div', { className: 'wsr-sub' }, state.error || t('loading')))))
      }
      const value = state.value
      const ordered = value.order.map((id) => state.providers.find((item) => item.id === id)).filter(Boolean)
      const disabled = state.saving || !state.editable
      return e('li', { className: 'wsr-card' },
        e('button', { className: 'wsr-head', type: 'button', 'aria-expanded': open, onClick: () => setOpen(!open) },
          e('span', { className: 'wsr-titlebox' },
            e('span', { className: 'wsr-title' }, t('title')),
            e('div', { className: 'wsr-sub' }, t('description'))),
          state.dirty ? e('span', { className: 'wsr-dirty' }, t('unsaved')) : null,
          e(uiPrimitives.IconChevronDownOutline14, { className: `wsr-chevron${open ? ' wsr-chevronOpen' : ''}`, 'aria-hidden': true })),
        open ? e('div', { className: 'wsr-body' },
          e('div', { className: 'wsr-section' },
            e('div', { className: 'wsr-sectionTitle' }, t('providers')),
            ordered.map((provider, index) => e('div', { className: 'wsr-provider', key: provider.id },
              e('div', { className: 'wsr-rank' },
                e('button', { type: 'button', disabled: disabled || index === 0, onClick: () => props.move(provider.id, -1), title: t('moveUp') }, '↑'),
                e('button', { type: 'button', disabled: disabled || index === ordered.length - 1, onClick: () => props.move(provider.id, 1), title: t('moveDown') }, '↓')),
              e('div', null,
                e('div', { className: 'wsr-pname' }, provider.name),
                e('div', { className: 'wsr-pdetail' }, state.credentialStatus[provider.id] ? t('configured') : t('notConfigured'))),
              e('label', { className: 'wsr-switch' },
                e('input', { type: 'checkbox', checked: value.enabledProviders.includes(provider.id), disabled, onChange: (event) => props.toggle(provider.id, event.target.checked) }),
                e('span', { className: 'wsr-track' }))))),
          e('div', { className: 'wsr-section' },
            e('div', { className: 'wsr-sectionTitle' }, t('providerSettings')),
            field(e, 'SearXNG Base URL', e('input', { className: 'wsr-input', value: value.searxngBaseURL || '', disabled, placeholder: 'http://127.0.0.1:8890', onChange: (event) => props.setField('searxngBaseURL', event.target.value) })),
            ...Object.keys(state.keyRefs).map((id) => field(e, `${state.providers.find((p) => p.id === id)?.name} Key`,
              e('div', { className: 'wsr-keyrow' },
                e('input', { className: 'wsr-input', type: 'password', autoComplete: 'off', value: state.keyDraft[id] || '', disabled, placeholder: state.keyClear[id] ? t('clearPending') : state.credentialStatus[id] ? t('keepKey') : t('notConfigured'), onChange: (event) => props.setKey(id, event.target.value) }),
                state.credentialStatus[id] && !state.keyClear[id] ? e('button', { className: 'wsr-mini', type: 'button', disabled, onClick: () => props.clearKey(id) }, t('clear')) : null)))),
          e('div', { className: 'wsr-section' },
            e('div', { className: 'wsr-sectionTitle' }, t('routingPolicy')),
            field(e, t('timeout'), e('select', { className: 'wsr-input', value: value.timeoutMs, disabled, onChange: (event) => props.setField('timeoutMs', event.target.value) }, TIMEOUT_OPTIONS.map((ms) => e('option', { key: ms, value: ms }, `${ms / 1000} s`)))),
            field(e, t('cooldown'), e('select', { className: 'wsr-input', value: value.cooldownSeconds, disabled, onChange: (event) => props.setField('cooldownSeconds', event.target.value) }, COOLDOWN_OPTIONS.map((sec) => e('option', { key: sec, value: sec }, sec < 60 ? `${sec} s` : `${sec / 60} min`)))),
            field(e, t('fallbackOnEmpty'), e('label', null, e('input', { type: 'checkbox', checked: value.fallbackOnEmpty, disabled, onChange: (event) => props.setField('fallbackOnEmpty', event.target.checked) }), ` ${t('enabled')}`)),
            e('div', { className: 'wsr-note' }, t('note'))),
          e('div', { className: 'wsr-footer' },
            state.error ? e('span', { className: 'wsr-error' }, state.error) : null,
            e('button', { className: 'wsr-btn', type: 'button', disabled: disabled || !state.dirty, onClick: props.discard }, t('discard')),
            e('button', { className: 'wsr-btn wsr-btnPrimary', type: 'button', disabled: disabled || !state.dirty, onClick: props.save }, state.saving ? t('saving') : t('save')))
        ) : null)
    }

    const inject = ['slots', 'locale', 'connection', 'settingsScope']
    function apply(ctx) {
      ctx.effect(() => injectCss(), 'web-search-router: styles')
      ctx.effect(() => ctx.locale.register(NS, LOCALES), 'web-search-router: locale')
      const connection = ctx.get('connection')
      const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
      const controller = new RouterCardController(connection.api, connection.isLoopback, ctx.locale.bind(NS), scope)
      ctx.effect(() => () => controller.unsubscribe?.(), 'web-search-router: settings scope subscription')
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: SETTINGS_NAMESPACE,
        locale: NS,
        inject: () => controller.inject(),
      }, RouterCard))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
