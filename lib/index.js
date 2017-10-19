import Hapi from 'hapi'
import YahooFinance from 'yahoo-finance'
import _ from 'lodash'

const ss = require('simple-statistics')

const server = new Hapi.Server()

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

server.connection({
  routes: {
    cors: true
  },
  host: 'localhost',
  port: 8000
})

server.route({
  method: 'GET',
  path: '/api/v1/snapshot/{symbol}',
  handler: function (request, reply) {

    YahooFinance.quote({
      symbol: request.params.symbol,
      modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
    }, function (err, snapshot) {
      if (err) {
        throw new Error(err)
      }
      return reply(snapshot)
    });
  }
})

server.route({
  method: 'POST',
  path: '/api/v1/fair-value',
  handler: function (request, reply) {

    YahooFinance.quote({
      symbol: request.payload.symbol,
      modules: ['price', 'defaultKeyStatistics', 'earnings', 'financialData']
    }, function (err, snapshot) {
      if (err) {
        throw new Error(err)
      }

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
      

      return reply({
        price,
        fairValue,
        discount: `${((1 - price / fairValue) * 100).toFixed(2)}%`,
        lastYearEarning,
        totalDebt,
        debtToEarning: !_.isNaN(lastYearEarning) ? +(totalDebt / lastYearEarning).toFixed(2) : null,
        meta: snapshot
      })
    });
  }
})

server.route({
  method: 'POST',
  path: '/api/v1/create-portfolio',
  handler: function (request, reply) {

    let now = new Date();
    let lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    const symbols = request.payload.symbols.replace(/ /g, '').split(/,/)

    YahooFinance.historical({
      symbols: symbols,
      to: now.toISOString().split('T')[0],
      from: lastYear.toISOString().split('T')[0]
      // period: 'd'  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
    }, function (err, quotes) {

      if (err) {
        return reply(new Err(err))
      }

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
        return reply(_.map(resultWithAllocation, symbolData => Object.assign({ shares: Math.floor(symbolData.allocation * request.payload.totalFundAmount / symbolData.adjClose) }, symbolData)))
      }

      return reply(resultWithAllocation)
    });
  }
})

server.route({
  method: 'GET',
  path: '/api/v1/earnings/{symbol}',
  handler: function (request, reply) {

    YahooFinance.quote({
      symbol: request.params.symbol,
      modules: ['earnings']
    }, function (err, earnings) {
      if (err) {
        throw new Error(err)
      }
      return reply(earnings)
    });
  }
})

server.route({
  method: 'GET',
  path: '/api/v1/financial-data/{symbol}',
  handler: function (request, reply) {

    YahooFinance.quote({
      symbol: request.params.symbol,
      modules: ['financialData']
    }, function (err, financialData) {
      if (err) {
        throw new Error(err)
      }
      return reply(financialData)
    });
  }
})

server.start((err) => {

  if (err) {
    throw err
  }
  console.log('Server running at:', server.info.uri)
})