'use strict';

(function () {
    /*
     * injects stylesheets into a provided shadow root
     */
    var fetchStyle = function fetchStyle(shadow, styles) {
        var style = document.createElement('style');

        style.innerHTML = styles.reduce(function (acc, css) {
            return acc + ('@import url("' + css + '"); ');
        }, style.innerHTML);

        shadow.appendChild(style);
    };

    /*
     * 😍 sequential script loader 😍
     */
    var fetchScripts = function fetchScripts(shadow, scripts) {
        var makePromise = function makePromise(js) {
            var promise = new Promise(function (resolve, reject) {
                var script = document.createElement('script');

                script.onload = function () {
                    return resolve();
                };
                script.onerror = function (e) {
                    return reject(e);
                };

                script.setAttribute('src', js);
                shadow.appendChild(script);
            });

            return promise;
        };

        // fetch scripts in order
        return scripts.reduce(function (sequence, js) {
            return sequence.then(function () {
                return makePromise(js);
            });
        }, Promise.resolve());
    };

    /*
     * all of the dependencies
     */
    var fetchResources = function fetchResources(shadow) {
        fetchStyle(shadow, ['css/bootstrap.css', 'css/style.css']);

        // returns a promise
        return fetchScripts(shadow, ['js/vendor/lodash.js']);
    };

    /*
     * <nx-search>
     */
    var searchProto = Object.create(HTMLElement.prototype, {
        name: {
            value: 'nx-search'
        },

        fetchResources: {
            value: fetchResources
        },

        attachedCallback: {
            value: function value() {
                var shadow = this.createShadowRoot();
                var channel = this.getAttribute('channel');

                // bring in dependencies
                this.fetchResources(shadow).then(function () {
                    var pubsub = typeof postal !== 'undefined' ? postal.channel(channel) : null;

                    // apply markup
                    var div = document.createElement('div');
                    var input = document.createElement('input');
                    var span = document.createElement('span');

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
                        input.oninput = function (e) {
                            var query = e.target.value;
                            pubsub && pubsub.publish('keyword', query);
                        };

                        // observe `__channel__ :: results` events
                        pubsub.subscribe('results', function (message, envelope) {
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
    var tableProto = Object.create(HTMLElement.prototype, {
        name: {
            value: 'nx-table'
        },

        fetchResources: {
            value: fetchResources
        },

        fetchData: {
            value: function value(url) {
                return fetch(url).then(function (response) {
                    return response.status === 200 ? response.json() : [];
                });
            }
        },

        findIndex: {
            value: function value(word, term) {
                return String(word).toLowerCase().indexOf(String(term).toLowerCase());
            }
        },

        filterRows: {
            value: function value(data, filter) {
                var _this = this;

                var rows = data.filter(function (row) {
                    return _.some(_.values(row), function (val) {
                        return ~_this.findIndex(val, filter);
                    });
                });

                // highlight matching terms
                return this.emphasize(rows, filter);
            }
        },

        emphasize: {
            value: function value(data, filter) {
                var _this2 = this;

                var copy = _.cloneDeep(data);

                copy.forEach(function (row) {
                    Object.keys(row).forEach(function (key) {
                        var word = String(row[key]);
                        var index = _this2.findIndex(word, filter);

                        if (filter.length && ~index) {
                            var em = word.substring(0, index) + '<mark>' + word.substring(index, index + filter.length) + '</mark>' + word.substring(index + filter.length);

                            row[key] = em;
                        }
                    });
                });

                return copy;
            }
        },

        enumerateCols: {
            value: function value(data) {
                var keys = {};
                var cols = data.reduce(function (acc, row) {
                    return acc.concat(Object.keys(row).filter(function (key) {
                        if (!keys[key]) {
                            keys[key] = Object.keys(keys).length + 1;
                            return true;
                        }
                        return false;
                    }));
                }, []);

                return cols;
            }
        },

        makeTable: {
            value: function value(cols, rows, pubsub) {
                var table = document.createElement('table');
                var head = document.createElement('thead');
                var body = document.createElement('tbody');
                var schema = document.createElement('tr');

                // apply style
                table.setAttribute('class', 'table table-striped table-hover');
                table.setAttribute('style', 'table-layout: fixed');

                // generate proper column headers
                cols.forEach(function (col) {
                    var entry = document.createElement('th');
                    entry.innerHTML = String(col).replace(/^\w|\s\w/gi, function ($0) {
                        return $0.toUpperCase();
                    });
                    schema.appendChild(entry);
                });

                head.appendChild(schema);
                table.appendChild(head);

                // generate rows
                rows.forEach(function (row) {
                    var tuple = document.createElement('tr');

                    cols.forEach(function (col) {
                        var entry = document.createElement('td');
                        entry.innerHTML = String(row[col]);
                        tuple.appendChild(entry);
                    });

                    body.appendChild(tuple);
                });

                table.appendChild(body);

                // fire results event
                if (pubsub) {
                    pubsub.publish('results', rows.length);
                }

                return table;
            }
        },

        attachedCallback: {
            value: function value() {
                var shadow = this.createShadowRoot();
                var channel = this.getAttribute('channel');
                var url = this.getAttribute('url');

                // closure, these need to live on
                var self = this;
                var init = {
                    rows: [],
                    cols: []
                };

                // bring in dependencies
                this.fetchResources(shadow).then(function () {
                    var pubsub = typeof postal !== 'undefined' ? postal.channel(channel) : null;

                    // fetch data
                    self.fetchData(url).then(function (rows) {
                        init.rows = rows, true;
                        init.cols = self.enumerateCols(rows);

                        // apply markup
                        var table = self.makeTable(init.cols, init.rows, pubsub);
                        shadow.appendChild(table);
                    });

                    // listen for `__channel__ :: keyword` events
                    if (pubsub) {
                        pubsub.subscribe('keyword', function (message, envelope) {
                            var filter = message;
                            var filteredRows = self.filterRows(init.rows, filter);

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
