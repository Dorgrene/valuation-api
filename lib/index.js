const Path = require('path');
const Hapi = require('hapi');
const Inert = require('inert');
import YahooFinance from 'yahoo-finance'
import _ from 'lodash'
import Boom from 'boom'

const ss = require('simple-statistics')

//const server = new Hapi.Server()

const DISCOUNT_RATE = .15

const getVolatility = (quotes = []) => {
  const lagQuotes = quotes.slice(1)
  const diffArray = []

  for (let i = 0; i < lagQuotes.length; i++) {
    diffArray.push(Math.log(quotes[i].adjClose) - Math.log(lagQuotes[i].adjClose))
  }

  return +(ss.standardDeviation(diffArray) * Math.sqrt(diffArray.length)).toFixed(5)
}

const getFairValue = (ttmEps, estPe, estGrowthRate, n = 10, distcountRate = DISCOUNT_RATE) => {
  const priceInNYears = ttmEps * Math.pow(1 + estGrowthRate, n) * Math.min(estPe, 2 * estGrowthRate * 100)
  return +priceInNYears / Math.pow(1 + distcountRate, n).toFixed(2)
}


const server = new Hapi.Server({
  port: 3000,
  host: 'localhost',
  routes: {
    files: {
      relativeTo: Path.join(__dirname, '../public')
    }
  }
});

const provision = async () => {

  await server.register(Inert);

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true,
      }
    }
  });

  await server.start();

  console.log('Server running at:', server.info.uri);
};

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
  handler: async function (request, h) {

    const snapshot = await YahooFinance.quote({
      symbol: request.params.symbol,
      modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
    });
    return snapshot
  }
})

server.route({
  method: 'POST',
  path: '/api/v1/fair-value',
  handler: async function (request, h) {

    try {
      const snapshot = await YahooFinance.quote({
        symbol: request.payload.symbol,
        modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
      });
      const price = snapshot.price.regularMarketPrice
      const eps = snapshot.defaultKeyStatistics.trailingEps
      const forwardPe = snapshot.defaultKeyStatistics.forwardPE
      const fairValue = getFairValue(eps, snapshot.defaultKeyStatistics.forwardPE, request.payload.growthRate)
      const lastThreeYearEarnings = snapshot.earnings.financialsChart.yearly
      let lastYearEarning, totalDebt
      if (lastThreeYearEarnings.length > 0) {
        lastYearEarning = lastThreeYearEarnings[lastThreeYearEarnings.length - 1].earnings
        totalDebt = snapshot.financialData.totalDebt
      }
      return ({
        price,
        fairValue,
        discount: `${((1 - price / fairValue) * 100).toFixed(2)}%`,
        lastYearEarning,
        totalDebt,
        debtToEarning: !_.isNaN(lastYearEarning) ? +(totalDebt / lastYearEarning).toFixed(2) : null,
        meta: snapshot
      })
    }
    catch (err) {
      return Boom.badRequest(`invalid symbol ${request.payload.symbol.toUpperCase()}`)
    }

    
  }
})

server.route({
  method: 'POST',
  path: '/api/v1/create-portfolio',
  handler: async function (request, h) {

    let now = new Date();
    let lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    const symbols = request.payload.symbols.replace(/ /g, '').split(/,/)
    try {
      const quotes = await YahooFinance.historical({
        symbols: symbols,
        to: now.toISOString().split('T')[0],
        from: lastYear.toISOString().split('T')[0]
        // period: 'd'  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
      });
      const result = _.map(symbols, (symbol) => ({
        symbol: symbol.toUpperCase(),
        histVolatility: getVolatility(quotes[symbol]),
        adjClose: +quotes[symbol][0].adjClose.toFixed(2)
      }))
  
      const firstVolatility = result[0].histVolatility
  
      const firstAllocation = _.reduce(result, (accumulator, symbolData) => accumulator + firstVolatility / symbolData.histVolatility, 0)
  
      result[0].allocation = +(1 / firstAllocation).toFixed(3)
  
      const coefficient = result[0].allocation * result[0].histVolatility
  
      const resultWithAllocation = _.map(result, symbolData => Object.assign({ allocation: +(coefficient / symbolData.histVolatility).toFixed(3) }, symbolData))
  
      if (request.payload.totalFundAmount) {
        return (_.map(resultWithAllocation, symbolData => Object.assign({ shares: Math.floor(symbolData.allocation * request.payload.totalFundAmount / symbolData.adjClose) }, symbolData)))
      }
  
      return (resultWithAllocation)
    }
    catch (err) {
      return (new Err(err))
    }
  }
})

server.route({
  method: 'GET',
  path: '/api/v1/earnings/{symbol}',
  handler: async function (request, h) {
    try {
      const earnings = await YahooFinance.quote({
        symbol: request.params.symbol,
        modules: ['earnings']
      })
      return (earnings)
    }
    catch (err) {
      throw new Error(err)
    }
  }
})

server.route({
  method: 'GET',
  path: '/api/v1/financial-data/{symbol}',
  handler: async function (request, h) {
    try {
      const financialData = await YahooFinance.quote({
        symbol: request.params.symbol,
        modules: ['financialData']
      })
      return (financialData)
    }
    catch (err) {
      throw new Error(err)
    }
  }
})

provision()
