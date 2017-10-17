'use strict';

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _hapi = require('hapi');

var _hapi2 = _interopRequireDefault(_hapi);

var _yahooFinance = require('yahoo-finance');

var _yahooFinance2 = _interopRequireDefault(_yahooFinance);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ss = require('simple-statistics');

var server = new _hapi2.default.Server();

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

server.connection({
  routes: {
    cors: true
  },
  host: 'localhost',
  port: 8000
});

server.route({
  method: 'GET',
  path: '/api/v1/snapshot/{symbol}',
  handler: function handler(request, reply) {

    _yahooFinance2.default.quote({
      symbol: request.params.symbol,
      modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
    }, function (err, snapshot) {
      if (err) {
        throw new Error(err);
      }
      return reply(snapshot);
    });
  }
});

server.route({
  method: 'POST',
  path: '/api/v1/fair-value',
  handler: function handler(request, reply) {

    _yahooFinance2.default.quote({
      symbol: request.payload.symbol,
      modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
    }, function (err, snapshot) {
      if (err) {
        throw new Error(err);
      }

      var price = snapshot.price.regularMarketPrice;
      var eps = snapshot.defaultKeyStatistics.trailingEps;
      var forwardPe = snapshot.defaultKeyStatistics.forwardPE;
      var fairValue = getFairValue(eps, snapshot.defaultKeyStatistics.forwardPE, request.payload.growthRate);
      var lastThreeYearEarnings = snapshot.earnings.financialsChart.yearly;
      var lastYearEarning = lastThreeYearEarnings[lastThreeYearEarnings.length - 1].earnings;
      var totalDebt = snapshot.financialData.totalDebt;

      return reply({
        price: price,
        fairValue: fairValue,
        discount: ((1 - price / fairValue) * 100).toFixed(2) + '%',
        lastYearEarning: lastYearEarning,
        totalDebt: totalDebt,
        debtToEarning: +(totalDebt / lastYearEarning).toFixed(2),
        meta: snapshot
      });
    });
  }
});

server.route({
  method: 'POST',
  path: '/api/v1/create-portfolio',
  handler: function handler(request, reply) {

    var now = new Date();
    var lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    var symbols = request.payload.symbols.replace(/ /g, '').split(/,/);

    _yahooFinance2.default.historical({
      symbols: symbols,
      to: now.toISOString().split('T')[0],
      from: lastYear.toISOString().split('T')[0]
      // period: 'd'  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
    }, function (err, quotes) {

      if (err) {
        return reply(new Err(err));
      }

      var result = _lodash2.default.map(symbols, function (symbol) {
        return {
          symbol: symbol.toUpperCase(),
          histVolatility: getVolatility(quotes[symbol]),
          adjClose: +quotes[symbol][0].adjClose.toFixed(2)
        };
      });

      var firstVolatility = result[0].histVolatility;

      var firstAllocation = _lodash2.default.reduce(result, function (accumulator, symbolData) {
        return accumulator + firstVolatility / symbolData.histVolatility;
      }, 0);

      result[0].allocation = +(1 / firstAllocation).toFixed(3);

      var coefficient = result[0].allocation * result[0].histVolatility;

      var resultWithAllocation = _lodash2.default.map(result, function (symbolData) {
        return (0, _assign2.default)({ allocation: +(coefficient / symbolData.histVolatility).toFixed(3) }, symbolData);
      });

      if (request.payload.totalFundAmount) {
        return reply(_lodash2.default.map(resultWithAllocation, function (symbolData) {
          return (0, _assign2.default)({ shares: Math.floor(symbolData.allocation * request.payload.totalFundAmount / symbolData.adjClose) }, symbolData);
        }));
      }

      return reply(resultWithAllocation);
    });
  }
});

server.route({
  method: 'GET',
  path: '/api/v1/earnings/{symbol}',
  handler: function handler(request, reply) {

    _yahooFinance2.default.quote({
      symbol: request.params.symbol,
      modules: ['earnings']
    }, function (err, earnings) {
      if (err) {
        throw new Error(err);
      }
      return reply(earnings);
    });
  }
});

server.route({
  method: 'GET',
  path: '/api/v1/financial-data/{symbol}',
  handler: function handler(request, reply) {

    _yahooFinance2.default.quote({
      symbol: request.params.symbol,
      modules: ['financialData']
    }, function (err, financialData) {
      if (err) {
        throw new Error(err);
      }
      return reply(financialData);
    });
  }
});

server.start(function (err) {

  if (err) {
    throw err;
  }
  console.log('Server running at:', server.info.uri);
});