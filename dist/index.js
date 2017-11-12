'use strict';

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _yahooFinance = require('yahoo-finance');

var _yahooFinance2 = _interopRequireDefault(_yahooFinance);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _boom = require('boom');

var _boom2 = _interopRequireDefault(_boom);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Path = require('path');
var Hapi = require('hapi');
var Inert = require('inert');


var ss = require('simple-statistics');

//const server = new Hapi.Server()

var DISCOUNT_RATE = .15;

var getVolatility = function getVolatility() {
  var quotes = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

  var lagQuotes = quotes.slice(1);
  var diffArray = [];

  for (var i = 0; i < lagQuotes.length; i++) {
    diffArray.push(Math.log(quotes[i].adjClose) - Math.log(lagQuotes[i].adjClose));
  }

  return +(ss.standardDeviation(diffArray) * Math.sqrt(diffArray.length)).toFixed(5);
};

var getFairValue = function getFairValue(ttmEps, estPe, estGrowthRate) {
  var n = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 10;
  var distcountRate = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : DISCOUNT_RATE;

  var priceInNYears = ttmEps * Math.pow(1 + estGrowthRate, n) * Math.min(estPe, 2 * estGrowthRate * 100);
  return +priceInNYears / Math.pow(1 + distcountRate, n).toFixed(2);
};

var server = new Hapi.Server({
  port: 3000,
  host: 'localhost',
  routes: {
    files: {
      relativeTo: Path.join(__dirname, '../public')
    }
  }
});

var provision = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return server.register(Inert);

          case 2:

            server.route({
              method: 'GET',
              path: '/{param*}',
              handler: {
                directory: {
                  path: '.',
                  redirectToSlash: true,
                  index: true
                }
              }
            });

            _context.next = 5;
            return server.start();

          case 5:

            console.log('Server running at:', server.info.uri);

          case 6:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, undefined);
  }));

  return function provision() {
    return _ref.apply(this, arguments);
  };
}();

/* server.connection({
  routes: {
    cors: true
  },
  host: 'localhost',
  port: 8000
}) */

server.route({
  method: 'GET',
  path: '/api/v1/snapshot/{symbol}',
  handler: function () {
    var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(request, h) {
      var snapshot;
      return _regenerator2.default.wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              _context2.next = 2;
              return _yahooFinance2.default.quote({
                symbol: request.params.symbol,
                modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
              });

            case 2:
              snapshot = _context2.sent;
              return _context2.abrupt('return', snapshot);

            case 4:
            case 'end':
              return _context2.stop();
          }
        }
      }, _callee2, this);
    }));

    function handler(_x4, _x5) {
      return _ref2.apply(this, arguments);
    }

    return handler;
  }()
});

server.route({
  method: 'POST',
  path: '/api/v1/fair-value',
  handler: function () {
    var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(request, h) {
      var snapshot, price, eps, forwardPe, fairValue, lastThreeYearEarnings, lastYearEarning, totalDebt;
      return _regenerator2.default.wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              _context3.prev = 0;
              _context3.next = 3;
              return _yahooFinance2.default.quote({
                symbol: request.payload.symbol,
                modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
              });

            case 3:
              snapshot = _context3.sent;
              price = snapshot.price.regularMarketPrice;
              eps = snapshot.defaultKeyStatistics.trailingEps;
              forwardPe = snapshot.defaultKeyStatistics.forwardPE;
              fairValue = getFairValue(eps, snapshot.defaultKeyStatistics.forwardPE, request.payload.growthRate);
              lastThreeYearEarnings = snapshot.earnings.financialsChart.yearly;
              lastYearEarning = void 0, totalDebt = void 0;

              if (lastThreeYearEarnings.length > 0) {
                lastYearEarning = lastThreeYearEarnings[lastThreeYearEarnings.length - 1].earnings;
                totalDebt = snapshot.financialData.totalDebt;
              }
              return _context3.abrupt('return', {
                price: price,
                fairValue: fairValue,
                discount: ((1 - price / fairValue) * 100).toFixed(2) + '%',
                lastYearEarning: lastYearEarning,
                totalDebt: totalDebt,
                debtToEarning: !_lodash2.default.isNaN(lastYearEarning) ? +(totalDebt / lastYearEarning).toFixed(2) : null,
                meta: snapshot
              });

            case 14:
              _context3.prev = 14;
              _context3.t0 = _context3['catch'](0);
              return _context3.abrupt('return', _boom2.default.badRequest('invalid symbol ' + request.payload.symbol.toUpperCase()));

            case 17:
            case 'end':
              return _context3.stop();
          }
        }
      }, _callee3, this, [[0, 14]]);
    }));

    function handler(_x6, _x7) {
      return _ref3.apply(this, arguments);
    }

    return handler;
  }()
});

server.route({
  method: 'POST',
  path: '/api/v1/create-portfolio',
  handler: function () {
    var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(request, h) {
      var now, lastYear, symbols, quotes, result, firstVolatility, firstAllocation, coefficient, resultWithAllocation;
      return _regenerator2.default.wrap(function _callee4$(_context4) {
        while (1) {
          switch (_context4.prev = _context4.next) {
            case 0:
              now = new Date();
              lastYear = new Date();

              lastYear.setFullYear(lastYear.getFullYear() - 1);
              symbols = request.payload.symbols.replace(/ /g, '').split(/,/);
              _context4.prev = 4;
              _context4.next = 7;
              return _yahooFinance2.default.historical({
                symbols: symbols,
                to: now.toISOString().split('T')[0],
                from: lastYear.toISOString().split('T')[0]
                // period: 'd'  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
              });

            case 7:
              quotes = _context4.sent;
              result = _lodash2.default.map(symbols, function (symbol) {
                return {
                  symbol: symbol.toUpperCase(),
                  histVolatility: getVolatility(quotes[symbol]),
                  adjClose: +quotes[symbol][0].adjClose.toFixed(2)
                };
              });
              firstVolatility = result[0].histVolatility;
              firstAllocation = _lodash2.default.reduce(result, function (accumulator, symbolData) {
                return accumulator + firstVolatility / symbolData.histVolatility;
              }, 0);


              result[0].allocation = +(1 / firstAllocation).toFixed(3);

              coefficient = result[0].allocation * result[0].histVolatility;
              resultWithAllocation = _lodash2.default.map(result, function (symbolData) {
                return (0, _assign2.default)({ allocation: +(coefficient / symbolData.histVolatility).toFixed(3) }, symbolData);
              });

              if (!request.payload.totalFundAmount) {
                _context4.next = 16;
                break;
              }

              return _context4.abrupt('return', _lodash2.default.map(resultWithAllocation, function (symbolData) {
                return (0, _assign2.default)({ shares: Math.floor(symbolData.allocation * request.payload.totalFundAmount / symbolData.adjClose) }, symbolData);
              }));

            case 16:
              return _context4.abrupt('return', resultWithAllocation);

            case 19:
              _context4.prev = 19;
              _context4.t0 = _context4['catch'](4);
              return _context4.abrupt('return', new Err(_context4.t0));

            case 22:
            case 'end':
              return _context4.stop();
          }
        }
      }, _callee4, this, [[4, 19]]);
    }));

    function handler(_x8, _x9) {
      return _ref4.apply(this, arguments);
    }

    return handler;
  }()
});

server.route({
  method: 'GET',
  path: '/api/v1/earnings/{symbol}',
  handler: function () {
    var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(request, h) {
      var earnings;
      return _regenerator2.default.wrap(function _callee5$(_context5) {
        while (1) {
          switch (_context5.prev = _context5.next) {
            case 0:
              _context5.prev = 0;
              _context5.next = 3;
              return _yahooFinance2.default.quote({
                symbol: request.params.symbol,
                modules: ['earnings']
              });

            case 3:
              earnings = _context5.sent;
              return _context5.abrupt('return', earnings);

            case 7:
              _context5.prev = 7;
              _context5.t0 = _context5['catch'](0);
              throw new Error(_context5.t0);

            case 10:
            case 'end':
              return _context5.stop();
          }
        }
      }, _callee5, this, [[0, 7]]);
    }));

    function handler(_x10, _x11) {
      return _ref5.apply(this, arguments);
    }

    return handler;
  }()
});

server.route({
  method: 'GET',
  path: '/api/v1/financial-data/{symbol}',
  handler: function () {
    var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(request, h) {
      var financialData;
      return _regenerator2.default.wrap(function _callee6$(_context6) {
        while (1) {
          switch (_context6.prev = _context6.next) {
            case 0:
              _context6.prev = 0;
              _context6.next = 3;
              return _yahooFinance2.default.quote({
                symbol: request.params.symbol,
                modules: ['financialData']
              });

            case 3:
              financialData = _context6.sent;
              return _context6.abrupt('return', financialData);

            case 7:
              _context6.prev = 7;
              _context6.t0 = _context6['catch'](0);
              throw new Error(_context6.t0);

            case 10:
            case 'end':
              return _context6.stop();
          }
        }
      }, _callee6, this, [[0, 7]]);
    }));

    function handler(_x12, _x13) {
      return _ref6.apply(this, arguments);
    }

    return handler;
  }()
});

provision();

/* server.start((err) => {

  if (err) {
    throw err
  }
  console.log('Server running at:', server.info.uri)
}) */