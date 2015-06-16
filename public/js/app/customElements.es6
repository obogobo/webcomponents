(function () {
    /*
     * injects stylesheets into a provided shadow root
     */
    const fetchStyle = function (shadow, styles) {
        const style = document.createElement('style');

        style.innerHTML = styles.reduce(function (acc, css) {
            return acc + `@import url("${css}"); `;
        }, style.innerHTML);

        shadow.appendChild(style);
    };

    /*
     * 😍 sequential script loader 😍
     */
    const fetchScripts = function (shadow, scripts) {
        const makePromise = function (js) {
            const promise = new Promise(function (resolve, reject) {
                const script = document.createElement('script');
                
                script.onload = (() => resolve());
                script.onerror = (e => reject(e));

                script.setAttribute('src', js);
                shadow.appendChild(script);
            });

            return promise;
        }

        // fetch scripts in order
        return scripts.reduce(function (sequence, js) {
            return sequence.then(function () {
                return makePromise(js); 
            })
        }, Promise.resolve());
    };

    /*
     * all of the dependencies
     */
    const fetchResources = function (shadow) {
        fetchStyle(shadow, [
            'css/bootstrap.css',
            'css/style.css'
        ]);

        // returns a promise
        return fetchScripts(shadow, [
            'js/vendor/lodash.js'
        ]);
    };
    
    /*
     * <nx-search>
     */
    const searchProto = Object.create(HTMLElement.prototype, {
        name: {
            value: 'nx-search'
        },

        fetchResources: {
            value: fetchResources
        },

        attachedCallback: {
            value: function () {
                const shadow = this.createShadowRoot();
                const channel = this.getAttribute('channel');

                // bring in dependencies
                this.fetchResources(shadow).then(function () {
                    const pubsub = (typeof postal !== 'undefined' ? postal.channel(channel) : null);

                    // apply markup
                    const div = document.createElement('div');
                    const input = document.createElement('input');
                    const span = document.createElement('span');

                    div.setAttribute('class', 'input-group');
                    input.setAttribute('type', 'text');
                    input.setAttribute('class', 'form-control');
                    input.setAttribute('placeholder', 'Search...');
                    span.setAttribute('class', 'input-group-addon');
                    span.innerHTML = '(0)';

                    div.appendChild(input);
                    div.appendChild(span);
                    shadow.appendChild(div);
                
                    if (pubsub) {
                        // produce `__channel__ :: keyword` events
                        input.oninput = (e => {
                            const query = e.target.value;
                            pubsub && pubsub.publish('keyword', query);
                        });

                        // observe `__channel__ :: results` events
                        pubsub.subscribe('results', (message, envelope) => {
                            span.innerHTML = '(' + message + ')';
                        });
                    }
                });
            }
        }
    });

    /*
     * <nx-table>
     */
    const tableProto = Object.create(HTMLElement.prototype, {
        name: {
            value: 'nx-table'
        },

        fetchResources: {
            value: fetchResources
        },

        fetchData: {
            value: function (url) {
                return fetch(url).then(response => {
                    return response.status === 200 ? response.json() : [];
                });
            }
        },

        findIndex: {
            value: function (word, term) {
                return String(word).toLowerCase().indexOf(String(term).toLowerCase());
            }
        },

        filterRows: {
            value: function (data, filter) {
                const rows = data.filter(row => {
                    return _.some(_.values(row), val => {
                        return ~this.findIndex(val, filter);
                    });
                });

                // highlight matching terms
                return this.emphasize(rows, filter);
            }
        },

        emphasize: {
            value: function (data, filter) {
                const copy = _.cloneDeep(data);

                copy.forEach(row => {
                    Object.keys(row).forEach(key => {
                        const word = String(row[ key ]);
                        const index = this.findIndex(word, filter);

                        if (filter.length && ~index ) {
                            const em = 
                                word.substring(0, index) + '<mark>' +
                                word.substring(index, index + filter.length) + '</mark>' +
                                word.substring(index + filter.length);

                            row[ key ] = em;
                        }
                    });
                });
                                
                return copy;
            }
        },

        enumerateCols: {
            value: function (data) {
                const keys = {};
                const cols = data.reduce((acc, row) => {
                    return acc.concat(Object.keys(row).filter(key => {
                        if (!keys[ key ]) {
                            keys[ key ] = Object.keys(keys).length + 1;
                            return true;
                        }
                        return false;
                    }));
                }, []);

                return cols;
            }
        },

        makeTable: {
            value: function (cols, rows, pubsub) {
                const table = document.createElement('table');
                const head = document.createElement('thead');
                const body = document.createElement('tbody');
                const schema = document.createElement('tr');

                // apply style
                table.setAttribute('class', 'table table-striped table-hover');
                table.setAttribute('style', 'table-layout: fixed');

                // generate proper column headers
                cols.forEach(col => {
                    const entry = document.createElement('th');
                    entry.innerHTML = String(col).replace(/^\w|\s\w/gi, function ($0) {
                        return $0.toUpperCase()
                    });
                    schema.appendChild(entry)
                });

                head.appendChild(schema);
                table.appendChild(head);

                // generate rows
                rows.forEach(row => {
                    const tuple = document.createElement('tr');

                    cols.forEach(col => {
                        const entry = document.createElement('td');
                        entry.innerHTML = String(row[ col ]);
                        tuple.appendChild(entry);
                    });

                    body.appendChild(tuple);
                });
                
                table.appendChild(body)

                // fire results event
                if (pubsub) {
                    pubsub.publish('results', rows.length);
                }

                return table;
            }
        },

        attachedCallback: {
            value: function () {
                const shadow = this.createShadowRoot();
                const channel = this.getAttribute('channel');
                const url = this.getAttribute('url');

                // closure, these need to live on
                const self = this;
                const init = {
                        rows: [],
                        cols: []
                    };

                // bring in dependencies
                this.fetchResources(shadow).then(function () {
                    const pubsub = (typeof postal !== 'undefined' ? postal.channel(channel) : null);

                    // fetch data
                    self.fetchData(url).then(rows => {
                        init.rows = rows, true;
                        init.cols = self.enumerateCols(rows);

                        // apply markup
                        const table = self.makeTable(init.cols, init.rows, pubsub);
                        shadow.appendChild(table);
                    });

                    // listen for `__channel__ :: keyword` events
                    if (pubsub) {
                        pubsub.subscribe('keyword', function (message, envelope) {
                            const filter = message;
                            const filteredRows = self.filterRows(init.rows, filter);

                            // remove old table, render new (with filter applied)
                            shadow.removeChild(shadow.querySelector('table'));
                            shadow.appendChild(self.makeTable(init.cols, filteredRows, pubsub));
                        });
                    }
                });
            }
        }
    });

    // make components available globally!
    document.registerElement('nx-table', {
        prototype: tableProto
    });

    document.registerElement('nx-search', {
        prototype: searchProto
    });

})();
