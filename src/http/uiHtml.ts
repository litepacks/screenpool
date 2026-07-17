export const UI_HTML = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScreenPool Console</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['Fira Code', 'monospace'],
          },
        },
      },
    };
  </script>
  <style>
    body {
      background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 50%),
                  radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.12), transparent 50%),
                  #090d16;
    }
    /* Custom Scrollbar for better aesthetics */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  </style>
  <script src="https://unpkg.com/mithril/mithril.js"></script>
</head>
<body class="text-slate-200 h-full flex flex-col antialiased">
  <div id="app" class="flex flex-col min-h-screen"></div>

  <script>
    // --- STATE MANAGEMENT ---
    const state = {
      activeTab: 'screenshot', // 'screenshot' | 'pdf' | 'extract' | 'stats'
      loading: false,
      error: null,
      
      screenshot: {
        sourceType: 'url',
        url: 'https://example.com',
        html: '<!-- Custom HTML to render -->\\n<div class="p-8 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl shadow-lg">\\n  <h1 class="text-3xl font-bold">Hello from ScreenPool!</h1>\\n  <p class="mt-2 text-purple-100">Rendered via in-process Chromium pool</p>\\n</div>',
        width: 1280,
        height: 720,
        format: 'png',
        quality: 85,
        fullPage: false,
        resultUrl: null,
        jobId: null,
        timeTaken: null
      },

      pdf: {
        sourceType: 'url',
        url: 'https://example.com',
        html: '<!-- Custom HTML to render -->\\n<div style="padding: 40px; font-family: sans-serif; color: #333;">\\n  <h1 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">PDF Generation Report</h1>\\n  <p>This document was compiled directly using the HTML-to-PDF engine.</p>\\n</div>',
        width: 1280,
        height: 720,
        printBackground: true,
        resultUrl: null,
        jobId: null,
        timeTaken: null
      },

      extract: {
        url: 'https://news.ycombinator.com',
        rules: 'title: css("title") | text\\nitems: css(".athing") | map({\\n  id: attr("id")\\n  title: css(".titleline > a") | text\\n  url: css(".titleline > a") | attr("href")\\n}) | array',
        width: 1280,
        height: 720,
        resultJson: null,
        jobId: null,
        timeTaken: null
      },

      stats: null,
      history: []
    };

    // --- API CALLS ---
    async function fetchStats() {
      try {
        const res = await fetch('/stats');
        if (res.ok) {
          state.stats = await res.json();
          m.redraw();
        }
      } catch (err) {
        console.error('Stats polling failed:', err);
      }
    }

    async function performScreenshot() {
      state.loading = true;
      state.error = null;
      const start = Date.now();
      try {
        const isHtml = state.screenshot.sourceType === 'html';
        const endpoint = isHtml ? '/html-to-image' : '/screenshot';
        
        const payload = {
          width: Number(state.screenshot.width),
          height: Number(state.screenshot.height),
          format: state.screenshot.format,
        };

        if (state.screenshot.format !== 'png') {
          payload.quality = Number(state.screenshot.quality);
        }

        if (isHtml) {
          payload.html = state.screenshot.html;
        } else {
          payload.url = state.screenshot.url;
          payload.fullPage = state.screenshot.fullPage;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(errData.message || \`HTTP \${res.status}\`);
        }

        const blob = await res.blob();
        const jobId = res.headers.get('x-job-id') || 'local';
        
        if (state.screenshot.resultUrl) {
          URL.revokeObjectURL(state.screenshot.resultUrl);
        }
        
        const url = URL.createObjectURL(blob);
        state.screenshot.resultUrl = url;
        state.screenshot.jobId = jobId;
        state.screenshot.timeTaken = Date.now() - start;

        state.history.unshift({
          id: jobId,
          timestamp: new Date().toLocaleTimeString(),
          type: 'Screenshot',
          target: isHtml ? 'Inline HTML' : state.screenshot.url,
          success: true,
          duration: state.screenshot.timeTaken,
          resultUrl: url,
          fileName: \`screenshot-\${jobId}.\${state.screenshot.format}\`
        });
      } catch (err) {
        state.error = err.message;
        state.history.unshift({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'Screenshot',
          target: state.screenshot.sourceType === 'html' ? 'Inline HTML' : state.screenshot.url,
          success: false,
          error: err.message
        });
      } finally {
        state.loading = false;
        m.redraw();
      }
    }

    async function performPdf() {
      state.loading = true;
      state.error = null;
      const start = Date.now();
      try {
        const isHtml = state.pdf.sourceType === 'html';
        const endpoint = isHtml ? '/html-to-pdf' : '/pdf';
        
        const payload = {
          width: Number(state.pdf.width),
          height: Number(state.pdf.height),
          pdf: {
            printBackground: state.pdf.printBackground
          }
        };

        if (isHtml) {
          payload.html = state.pdf.html;
        } else {
          payload.url = state.pdf.url;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(errData.message || \`HTTP \${res.status}\`);
        }

        const blob = await res.blob();
        const jobId = res.headers.get('x-job-id') || 'local';

        if (state.pdf.resultUrl) {
          URL.revokeObjectURL(state.pdf.resultUrl);
        }

        const url = URL.createObjectURL(blob);
        state.pdf.resultUrl = url;
        state.pdf.jobId = jobId;
        state.pdf.timeTaken = Date.now() - start;

        state.history.unshift({
          id: jobId,
          timestamp: new Date().toLocaleTimeString(),
          type: 'PDF',
          target: isHtml ? 'Inline HTML' : state.pdf.url,
          success: true,
          duration: state.pdf.timeTaken,
          resultUrl: url,
          fileName: \`document-\${jobId}.pdf\`
        });
      } catch (err) {
        state.error = err.message;
        state.history.unshift({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'PDF',
          target: state.pdf.sourceType === 'html' ? 'Inline HTML' : state.pdf.url,
          success: false,
          error: err.message
        });
      } finally {
        state.loading = false;
        m.redraw();
      }
    }

    async function performExtract() {
      state.loading = true;
      state.error = null;
      const start = Date.now();
      try {
        const payload = {
          url: state.extract.url,
          rules: state.extract.rules,
          width: Number(state.extract.width),
          height: Number(state.extract.height)
        };

        const res = await fetch('/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(errData.message || \`HTTP \${res.status}\`);
        }

        const data = await res.json();
        const jobId = res.headers.get('x-job-id') || 'local';

        state.extract.resultJson = JSON.stringify(data, null, 2);
        state.extract.jobId = jobId;
        state.extract.timeTaken = Date.now() - start;

        state.history.unshift({
          id: jobId,
          timestamp: new Date().toLocaleTimeString(),
          type: 'Extract',
          target: state.extract.url,
          success: true,
          duration: state.extract.timeTaken,
          dataSummary: JSON.stringify(data).substr(0, 60) + '...'
        });
      } catch (err) {
        state.error = err.message;
        state.history.unshift({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'Extract',
          target: state.extract.url,
          success: false,
          error: err.message
        });
      } finally {
        state.loading = false;
        m.redraw();
      }
    }

    // --- POLL SYSTEM STATS ---
    setInterval(fetchStats, 2000);
    fetchStats();

    // --- MITHRIL COMPONENTS ---
    const Icon = {
      view: (vnode) => {
        const name = vnode.attrs.name;
        const classes = vnode.attrs.class || 'w-5 h-5';
        if (name === 'camera') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z' }),
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z' })
          );
        }
        if (name === 'pdf') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' })
          );
        }
        if (name === 'extract') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5' })
          );
        }
        if (name === 'stats') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' })
          );
        }
        if (name === 'check') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M4.5 12.75l6 6 9-13.5' })
          );
        }
        if (name === 'cross') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })
          );
        }
        if (name === 'download') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3' })
          );
        }
        if (name === 'copy') {
          return m('svg', { class: classes, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
            m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376A8.965 8.965 0 0012 12.75a8.965 8.965 0 00-3.75 3.376m6.15-4.993a4.804 4.804 0 00-6.761 0M19.25 4.75h-3.375a1.125 1.125 0 00-1.125 1.125v3.375c0 .621.504 1.125 1.125 1.125h3.375A1.125 1.125 0 0020.5 9.25V5.875c0-.621-.504-1.125-1.125-1.125z' })
          );
        }
        return null;
      }
    };

    const Header = {
      view: () => {
        const isHealthy = state.stats && state.stats.started;
        return m('header', { class: 'border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40' }, [
          m('div', { class: 'flex items-center gap-3' }, [
            m('div', { class: 'p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg shadow-inner' }, 
              m(Icon, { name: 'camera', class: 'w-6 h-6' })
            ),
            m('div', [
              m('h1', { class: 'text-xl font-bold tracking-tight text-white flex items-center gap-2' }, [
                'ScreenPool',
                m('span', { class: 'text-xs font-semibold px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-indigo-400' }, 'v0.2.1')
              ]),
              m('p', { class: 'text-xs text-slate-400 mt-0.5' }, 'In-process headless browser rendering pool')
            ])
          ]),
          m('div', { class: 'flex items-center gap-4' }, [
            // Status Indicator
            m('div', { class: 'flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg' }, [
              m('span', { class: \`w-2.5 h-2.5 rounded-full animate-pulse \${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}\` }),
              m('span', { class: 'text-xs font-medium text-slate-300' }, isHealthy ? 'Active' : 'Offline')
            ])
          ])
        ]);
      }
    };

    const Tabs = {
      view: () => {
        const tabs = [
          { id: 'screenshot', label: 'Screenshot', icon: 'camera' },
          { id: 'pdf', label: 'PDF Generation', icon: 'pdf' },
          { id: 'extract', label: 'Data Extract', icon: 'extract' },
          { id: 'stats', label: 'System Stats', icon: 'stats' }
        ];

        return m('nav', { class: 'flex gap-2 p-1.5 bg-slate-950/80 border border-slate-800/80 rounded-xl mb-6' }, 
          tabs.map(tab => {
            const isActive = state.activeTab === tab.id;
            return m('button', {
              class: \`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 \${
                isActive 
                  ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-300 shadow-md shadow-indigo-500/5' 
                  : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-900/50'
              }\`,
              onclick: () => {
                state.activeTab = tab.id;
                state.error = null;
              }
            }, [
              m(Icon, { name: tab.icon, class: 'w-4.5 h-4.5' }),
              tab.label
            ]);
          })
        );
      }
    };

    // Card styling utility helper
    const cardClass = 'backdrop-blur-md bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-2xl';

    const FormInput = {
      view: (vnode) => {
        return m('div', { class: 'space-y-1.5' }, [
          m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, vnode.attrs.label),
          m('input', {
            type: vnode.attrs.type || 'text',
            value: vnode.attrs.value,
            placeholder: vnode.attrs.placeholder,
            class: 'w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200',
            oninput: (e) => vnode.attrs.oninput(e.target.value)
          })
        ]);
      }
    };

    const FormToggle = {
      view: (vnode) => {
        return m('div', { class: 'space-y-1.5' }, [
          m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, vnode.attrs.label),
          m('div', { class: 'flex gap-2 p-1 bg-slate-950/60 border border-slate-800 rounded-lg' }, 
            vnode.attrs.options.map(opt => {
              const isActive = vnode.attrs.value === opt.id;
              return m('button', {
                type: 'button',
                class: \`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 \${
                  isActive ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }\`,
                onclick: () => vnode.attrs.onchange(opt.id)
              }, opt.label);
            })
          )
        ]);
      }
    };

    const LoadingSpinner = {
      view: () => m('div', { class: 'flex flex-col items-center justify-center py-12 space-y-4' }, [
        m('div', { class: 'w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin' }),
        m('p', { class: 'text-sm text-slate-400 animate-pulse font-medium' }, 'Executing job on worker pool...')
      ])
    };

    const ErrorBanner = {
      view: () => state.error ? m('div', { class: 'bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl p-4 flex gap-3 text-sm mb-6 animate-fade-in' }, [
        m(Icon, { name: 'cross', class: 'w-5 h-5 text-rose-400 shrink-0 mt-0.5' }),
        m('div', [
          m('p', { class: 'font-semibold' }, 'Operation Failed'),
          m('p', { class: 'text-rose-400/90 mt-1 font-mono text-xs' }, state.error)
        ])
      ]) : null
    };

    // --- TAB VIEWS ---
    const ScreenshotTab = {
      view: () => {
        const sc = state.screenshot;
        return m('div', { class: 'grid grid-cols-1 lg:grid-cols-12 gap-6' }, [
          // Control Panel
          m('div', { class: \`lg:col-span-5 flex flex-col gap-5 \${cardClass}\` }, [
            m('h2', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3' }, 'Configure Capture'),
            m(FormToggle, {
              label: 'Source',
              value: sc.sourceType,
              options: [
                { id: 'url', label: 'URL Address' },
                { id: 'html', label: 'HTML Snippet' }
              ],
              onchange: (val) => sc.sourceType = val
            }),
            sc.sourceType === 'url' 
              ? m(FormInput, {
                  label: 'Target URL',
                  value: sc.url,
                  placeholder: 'https://example.com',
                  oninput: (val) => sc.url = val
                })
              : m('div', { class: 'space-y-1.5' }, [
                  m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, 'Inline HTML'),
                  m('textarea', {
                    rows: 6,
                    value: sc.html,
                    class: 'w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200',
                    oninput: (e) => sc.html = e.target.value
                  })
                ]),
            
            // Dimensions
            m('div', { class: 'grid grid-cols-2 gap-4' }, [
              m(FormInput, {
                label: 'Width (px)',
                type: 'number',
                value: sc.width,
                oninput: (val) => sc.width = val
              }),
              m(FormInput, {
                label: 'Height (px)',
                type: 'number',
                value: sc.height,
                oninput: (val) => sc.height = val
              })
            ]),

            // Formatting
            m('div', { class: 'grid grid-cols-2 gap-4' }, [
              m('div', { class: 'space-y-1.5' }, [
                m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, 'Format'),
                m('select', {
                  value: sc.format,
                  class: 'w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none transition-all duration-200',
                  onchange: (e) => sc.format = e.target.value
                }, [
                  m('option', { value: 'png' }, 'PNG Image'),
                  m('option', { value: 'jpeg' }, 'JPEG Image'),
                  m('option', { value: 'webp' }, 'WebP Image')
                ])
              ]),
              sc.format !== 'png' ? m('div', { class: 'space-y-1.5' }, [
                m('div', { class: 'flex justify-between items-center' }, [
                  m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, 'Quality'),
                  m('span', { class: 'text-xs font-semibold text-indigo-400' }, sc.quality + '%')
                ]),
                m('input', {
                  type: 'range',
                  min: 10,
                  max: 100,
                  value: sc.quality,
                  class: 'w-full accent-indigo-500 mt-2.5',
                  oninput: (e) => sc.quality = e.target.value
                })
              ]) : null
            ]),

            // Options
            sc.sourceType === 'url' ? m('label', { class: 'flex items-center gap-3 cursor-pointer py-1 text-sm text-slate-300 select-none' }, [
              m('input', {
                type: 'checkbox',
                checked: sc.fullPage,
                class: 'w-4 h-4 rounded text-indigo-500 bg-slate-900 border-slate-700 focus:ring-indigo-500/50 focus:ring-offset-0 focus:outline-none transition-all duration-150',
                onchange: (e) => sc.fullPage = e.target.checked
              }),
              'Full Page Capture'
            ]) : null,

            // Submit Button
            m('button', {
              class: 'w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed',
              disabled: state.loading,
              onclick: performScreenshot
            }, 'Capture Screenshot')
          ]),
          
          // Preview Panel
          m('div', { class: \`lg:col-span-7 flex flex-col gap-4 \${cardClass}\` }, [
            m('h3', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3' }, 'Image Preview'),
            state.loading 
              ? m(LoadingSpinner)
              : sc.resultUrl 
                ? m('div', { class: 'flex flex-col gap-4 flex-1' }, [
                    // Result Info
                    m('div', { class: 'flex justify-between items-center text-xs text-slate-400 bg-slate-900/50 px-4 py-2 border border-slate-800 rounded-lg' }, [
                      m('span', [
                        'Job ID: ',
                        m('span', { class: 'font-mono font-medium text-slate-300' }, sc.jobId)
                      ]),
                      m('span', [
                        'Render Time: ',
                        m('span', { class: 'font-semibold text-indigo-400' }, sc.timeTaken + 'ms')
                      ])
                    ]),
                    // Image Container
                    m('div', { class: 'border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/80 relative flex items-center justify-center flex-1 min-h-[350px] max-h-[480px]' }, [
                      m('img', {
                        src: sc.resultUrl,
                        class: 'max-w-full max-h-[460px] object-contain shadow-2xl'
                      })
                    ]),
                    // Actions
                    m('a', {
                      href: sc.resultUrl,
                      download: \`screenshot-\${sc.jobId || 'output'}.\${sc.format}\`,
                      class: 'inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 active:scale-[0.99] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-150'
                    }, [
                      m(Icon, { name: 'download', class: 'w-4.5 h-4.5' }),
                      'Download Output'
                    ])
                  ])
                : m('div', { class: 'flex flex-col items-center justify-center text-slate-500 py-24 flex-1 border-2 border-dashed border-slate-800/50 rounded-xl' }, [
                    m(Icon, { name: 'camera', class: 'w-12 h-12 mb-3 opacity-20' }),
                    m('p', { class: 'text-sm font-medium' }, 'Awaiting capture request')
                  ])
          ])
        ]);
      }
    };

    const PdfTab = {
      view: () => {
        const pd = state.pdf;
        return m('div', { class: 'grid grid-cols-1 lg:grid-cols-12 gap-6' }, [
          // Control Panel
          m('div', { class: \`lg:col-span-5 flex flex-col gap-5 \${cardClass}\` }, [
            m('h2', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3' }, 'Configure PDF'),
            m(FormToggle, {
              label: 'Source',
              value: pd.sourceType,
              options: [
                { id: 'url', label: 'URL Address' },
                { id: 'html', label: 'HTML Snippet' }
              ],
              onchange: (val) => pd.sourceType = val
            }),
            pd.sourceType === 'url' 
              ? m(FormInput, {
                  label: 'Target URL',
                  value: pd.url,
                  placeholder: 'https://example.com',
                  oninput: (val) => pd.url = val
                })
              : m('div', { class: 'space-y-1.5' }, [
                  m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, 'Inline HTML'),
                  m('textarea', {
                    rows: 6,
                    value: pd.html,
                    class: 'w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200',
                    oninput: (e) => pd.html = e.target.value
                  })
                ]),
            
            // Dimensions
            m('div', { class: 'grid grid-cols-2 gap-4' }, [
              m(FormInput, {
                label: 'Viewport Width (px)',
                type: 'number',
                value: pd.width,
                oninput: (val) => pd.width = val
              }),
              m(FormInput, {
                label: 'Viewport Height (px)',
                type: 'number',
                value: pd.height,
                oninput: (val) => pd.height = val
              })
            ]),

            // Options
            m('label', { class: 'flex items-center gap-3 cursor-pointer py-1 text-sm text-slate-300 select-none' }, [
              m('input', {
                type: 'checkbox',
                checked: pd.printBackground,
                class: 'w-4 h-4 rounded text-indigo-500 bg-slate-900 border-slate-700 focus:ring-indigo-500/50 focus:ring-offset-0 focus:outline-none transition-all duration-150',
                onchange: (e) => pd.printBackground = e.target.checked
              }),
              'Print Background Colors'
            ]),

            // Submit Button
            m('button', {
              class: 'w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed',
              disabled: state.loading,
              onclick: performPdf
            }, 'Generate PDF')
          ]),
          
          // Preview Panel
          m('div', { class: \`lg:col-span-7 flex flex-col gap-4 \${cardClass}\` }, [
            m('h3', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3' }, 'PDF Output'),
            state.loading 
              ? m(LoadingSpinner)
              : pd.resultUrl 
                ? m('div', { class: 'flex flex-col gap-4 flex-1' }, [
                    m('div', { class: 'flex justify-between items-center text-xs text-slate-400 bg-slate-900/50 px-4 py-2 border border-slate-800 rounded-lg' }, [
                      m('span', [
                        'Job ID: ',
                        m('span', { class: 'font-mono font-medium text-slate-300' }, pd.jobId)
                      ]),
                      m('span', [
                        'Render Time: ',
                        m('span', { class: 'font-semibold text-indigo-400' }, pd.timeTaken + 'ms')
                      ])
                    ]),
                    // Embed or Icon Link
                    m('div', { class: 'border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80 flex-1 min-h-[350px] max-h-[480px] flex items-center justify-center flex-col p-6' }, [
                      m(Icon, { name: 'pdf', class: 'w-16 h-16 text-rose-400/80 mb-4 animate-bounce' }),
                      m('p', { class: 'text-sm font-semibold text-white' }, 'PDF generated successfully!'),
                      m('p', { class: 'text-xs text-slate-400 mt-1' }, 'Preview is available via external viewer or direct download.'),
                      m('a', {
                        href: pd.resultUrl,
                        target: '_blank',
                        class: 'mt-5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline'
                      }, 'Open in browser tab →')
                    ]),
                    // Download Action
                    m('a', {
                      href: pd.resultUrl,
                      download: \`document-\${pd.jobId || 'output'}.pdf\`,
                      class: 'inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 active:scale-[0.99] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-150'
                    }, [
                      m(Icon, { name: 'download', class: 'w-4.5 h-4.5' }),
                      'Download PDF File'
                    ])
                  ])
                : m('div', { class: 'flex flex-col items-center justify-center text-slate-500 py-24 flex-1 border-2 border-dashed border-slate-800/50 rounded-xl' }, [
                    m(Icon, { name: 'pdf', class: 'w-12 h-12 mb-3 opacity-20' }),
                    m('p', { class: 'text-sm font-medium' }, 'Awaiting compilation request')
                  ])
          ])
        ]);
      }
    };

    const ExtractTab = {
      view: () => {
        const ex = state.extract;
        return m('div', { class: 'grid grid-cols-1 lg:grid-cols-12 gap-6' }, [
          // Control Panel
          m('div', { class: \`lg:col-span-5 flex flex-col gap-5 \${cardClass}\` }, [
            m('h2', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3' }, 'Configure Extract'),
            m(FormInput, {
              label: 'Target URL',
              value: ex.url,
              placeholder: 'https://news.ycombinator.com',
              oninput: (val) => ex.url = val
            }),
            m('div', { class: 'space-y-1.5' }, [
              m('label', { class: 'block text-xs font-semibold text-slate-400 tracking-wide uppercase' }, 'Pipsel DSL Rules'),
              m('textarea', {
                rows: 8,
                value: ex.rules,
                placeholder: 'title: css("h1") | text',
                class: 'w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200',
                oninput: (e) => ex.rules = e.target.value
              })
            ]),
            m('div', { class: 'grid grid-cols-2 gap-4' }, [
              m(FormInput, {
                label: 'Width (px)',
                type: 'number',
                value: ex.width,
                oninput: (val) => ex.width = val
              }),
              m(FormInput, {
                label: 'Height (px)',
                type: 'number',
                value: ex.height,
                oninput: (val) => ex.height = val
              })
            ]),
            m('button', {
              class: 'w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed',
              disabled: state.loading,
              onclick: performExtract
            }, 'Run Extraction')
          ]),
          
          // Result Panel
          m('div', { class: \`lg:col-span-7 flex flex-col gap-4 \${cardClass}\` }, [
            m('h3', { class: 'text-lg font-bold text-white tracking-wide border-b border-slate-800 pb-3 flex justify-between items-center' }, [
              'JSON Result',
              ex.resultJson ? m('button', {
                class: 'text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 border border-slate-700 rounded-md transition-all duration-150',
                onclick: () => {
                  navigator.clipboard.writeText(ex.resultJson);
                  alert('Copied to clipboard!');
                }
              }, [
                m(Icon, { name: 'copy', class: 'w-3.5 h-3.5' }),
                'Copy JSON'
              ]) : null
            ]),
            state.loading 
              ? m(LoadingSpinner)
              : ex.resultJson 
                ? m('div', { class: 'flex flex-col gap-4 flex-1' }, [
                    m('div', { class: 'flex justify-between items-center text-xs text-slate-400 bg-slate-900/50 px-4 py-2 border border-slate-800 rounded-lg' }, [
                      m('span', [
                        'Job ID: ',
                        m('span', { class: 'font-mono font-medium text-slate-300' }, ex.jobId)
                      ]),
                      m('span', [
                        'Render Time: ',
                        m('span', { class: 'font-semibold text-indigo-400' }, ex.timeTaken + 'ms')
                      ])
                    ]),
                    m('pre', { class: 'border border-slate-800/80 rounded-xl p-4 bg-slate-950/80 text-emerald-400/90 text-xs font-mono overflow-auto flex-1 max-h-[460px] leading-relaxed' }, 
                      ex.resultJson
                    )
                  ])
                : m('div', { class: 'flex flex-col items-center justify-center text-slate-500 py-24 flex-1 border-2 border-dashed border-slate-800/50 rounded-xl' }, [
                    m(Icon, { name: 'extract', class: 'w-12 h-12 mb-3 opacity-20' }),
                    m('p', { class: 'text-sm font-medium' }, 'Awaiting extraction request')
                  ])
          ])
        ]);
      }
    };

    const StatsTab = {
      view: () => {
        if (!state.stats) {
          return m('div', { class: 'text-center py-16 text-slate-400 font-medium animate-pulse' }, 'Loading metrics from server...');
        }
        
        const info = state.stats;
        const uptimeSeconds = Math.floor(info.uptimeMs / 1000);
        const formatUptime = (seconds) => {
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const s = seconds % 60;
          return \`\sm \${h}h \${m}m \${s}s\`;
        };

        const metrics = [
          { label: 'Uptime', value: formatUptime(uptimeSeconds), class: 'text-white' },
          { label: 'Active Jobs / Pool Size', value: \`\${info.activeJobs} / \${info.poolSize}\`, class: 'text-indigo-400 font-semibold' },
          { label: 'Queued Jobs', value: info.queuedJobs, class: info.queuedJobs > 0 ? 'text-amber-400 font-semibold' : 'text-slate-300' },
          { label: 'Completed Jobs', value: info.completedJobs, class: 'text-emerald-400 font-semibold' },
          { label: 'Failed Jobs', value: info.failedJobs, class: info.failedJobs > 0 ? 'text-rose-400 font-semibold' : 'text-slate-300' },
          { label: 'Browser Restarts', value: info.browserRestarts, class: info.browserRestarts > 0 ? 'text-rose-400 font-semibold' : 'text-slate-300' },
          { label: 'Worker Restarts', value: info.workerRestarts, class: info.workerRestarts > 0 ? 'text-amber-400 font-semibold' : 'text-slate-300' }
        ];

        return m('div', { class: 'space-y-6' }, [
          // Stat Cards Grid
          m('div', { class: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4' }, 
            metrics.map(m => m('div', { class: \`border border-slate-800 bg-slate-900/40 rounded-xl p-5 shadow-lg flex flex-col justify-between\` }, [
              m('span', { class: 'text-xs font-semibold text-slate-400 uppercase tracking-wider' }, m.label),
              m('span', { class: \`text-xl font-bold mt-2.5 \${m.class}\` }, m.value)
            ]))
          ),

          // Memory Usage Bar
          m('div', { class: \`\${cardClass} flex flex-col gap-4\` }, [
            m('h3', { class: 'text-sm font-bold text-white uppercase tracking-wider' }, 'Memory Utilization'),
            m('div', { class: 'flex items-center justify-between text-xs font-medium text-slate-400 mt-1' }, [
              m('span', [
                'Current RSS: ',
                m('span', { class: 'text-indigo-400 font-bold font-mono text-sm' }, info.memoryUsageMb + ' MB')
              ]),
              m('span', [
                'V8 Heap Limit: ',
                m('span', { class: 'text-slate-300 font-bold font-mono' }, info.memoryLimitMb + ' MB')
              ])
            ]),
            m('div', { class: 'w-full bg-slate-950 border border-slate-850 h-3 rounded-full overflow-hidden mt-1.5' }, [
              m('div', {
                class: \`h-full bg-gradient-to-r transition-all duration-500 \${
                  info.memoryBlocked ? 'from-rose-500 to-red-600' : 'from-indigo-500 to-purple-500'
                }\`,
                style: { width: \`\${Math.min(100, (info.memoryUsageMb / info.memoryLimitMb) * 100)}%\` }
              })
            ]),
            info.memoryBlocked ? m('div', { class: 'text-xs font-semibold text-rose-400 flex items-center gap-1.5 mt-2 bg-rose-950/20 px-3 py-2 border border-rose-800/30 rounded-md' }, [
              m('span', { class: 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping' }),
              'Memory limit exceeded: Worker pool is under load throttling.'
            ]) : null
          ])
        ]);
      }
    };

    const HistoryLog = {
      view: () => {
        if (state.history.length === 0) return null;
        return m('div', { class: \`\${cardClass} flex flex-col gap-4 mt-6\` }, [
          m('h3', { class: 'text-lg font-bold text-white border-b border-slate-800 pb-3' }, 'Session History'),
          m('div', { class: 'overflow-x-auto' }, [
            m('table', { class: 'w-full text-left text-sm text-slate-300 border-collapse' }, [
              m('thead', [
                m('tr', { class: 'border-b border-slate-800 text-slate-400 font-semibold' }, [
                  m('th', { class: 'py-2 px-4' }, 'Time'),
                  m('th', { class: 'py-2 px-4' }, 'Action'),
                  m('th', { class: 'py-2 px-4' }, 'Target'),
                  m('th', { class: 'py-2 px-4' }, 'Status'),
                  m('th', { class: 'py-2 px-4' }, 'Duration'),
                  m('th', { class: 'py-2 px-4 text-right' }, 'Action')
                ])
              ]),
              m('tbody', state.history.map(item => {
                return m('tr', { key: item.id, class: 'border-b border-slate-800/50 hover:bg-slate-900/20' }, [
                  m('td', { class: 'py-3 px-4 text-xs font-medium text-slate-400' }, item.timestamp),
                  m('td', { class: 'py-3 px-4 font-bold text-indigo-400' }, item.type),
                  m('td', { class: 'py-3 px-4 text-xs truncate max-w-[200px] font-mono' }, item.target),
                  m('td', { class: 'py-3 px-4' }, 
                    item.success
                      ? m('span', { class: 'inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded-full' }, [
                          m(Icon, { name: 'check', class: 'w-3 h-3' }),
                          'Success'
                        ])
                      : m('span', { class: 'inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 border border-rose-500/20 rounded-full' }, [
                          m(Icon, { name: 'cross', class: 'w-3 h-3' }),
                          'Failed'
                        ])
                  ),
                  m('td', { class: 'py-3 px-4 font-semibold text-xs' }, item.success ? \`\${item.duration}ms\` : '-'),
                  m('td', { class: 'py-3 px-4 text-right' }, 
                    item.success && item.resultUrl
                      ? m('a', {
                          href: item.resultUrl,
                          download: item.fileName || 'download',
                          class: 'text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline'
                        }, 'Download')
                      : item.error 
                        ? m('span', { class: 'text-xs text-rose-400 truncate max-w-[150px] inline-block font-mono' }, item.error)
                        : '-'
                  )
                ]);
              }))
            ])
          ])
        ]);
      }
    };

    // --- MAIN APP RENDERER ---
    const Layout = {
      view: () => {
        return m('div', { class: 'flex-1 flex flex-col' }, [
          m(Header),
          m('main', { class: 'flex-1 max-w-7xl w-full mx-auto p-4 md:p-6' }, [
            m(Tabs),
            m(ErrorBanner),
            state.activeTab === 'screenshot' ? m(ScreenshotTab) : null,
            state.activeTab === 'pdf' ? m(PdfTab) : null,
            state.activeTab === 'extract' ? m(ExtractTab) : null,
            state.activeTab === 'stats' ? m(StatsTab) : null,
            m(HistoryLog)
          ]),
          m('footer', { class: 'border-t border-slate-900 bg-slate-950/40 text-center py-4 text-xs text-slate-500' }, 
            'ScreenPool Console Client. Pair programming with Antigravity AI.'
          )
        ]);
      }
    };

    m.mount(document.getElementById('app'), Layout);
  </script>
</body>
</html>
`;
