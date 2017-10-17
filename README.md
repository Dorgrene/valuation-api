# valuation-api
This is a hapijs server based stock valuation api
Currently it supports two main functionalities:

1. Calculation of Fair Value based on a given growth rate and a 15% discount rate
```javascript
path: /api/v1/fair-value
{
  METHOD: 'POST'
  data: {
    symbol: 'AAPL',
    growthRate: '.20'
  }
}

result: {
  "price": 156.99,
  "fairValue": 99.63,
  "discount": "-57.58%",
  "lastYearEarning": 45687000000,
  "totalDebt": 108602998784,
  "debtToEarning": 2.38
}
```

2. Construct an un-levered risk parity portfolio based on the volatility of given symbols.
```javascript
path: /api/v1/create-portfolio
{
  METHOD: 'POST'
  data: {
    symbols: goog,aapl,
    totalFundAmount: 10000
  }
}

result: [
    {
        "shares": 5,
        "allocation": 0.516,
        "symbol": "GOOG",
        "histVolatility": 0.15951,
        "adjClose": 992
    },
    {
        "shares": 30,
        "allocation": 0.483,
        "symbol": "AAPL",
        "histVolatility": 0.17029,
        "adjClose": 159.88
    }
]
```
