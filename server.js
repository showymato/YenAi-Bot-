const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ccxt = require('ccxt');
const path = require('path');
const TI = require('technicalindicators');

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

class AdvancedCryptoBot {
  constructor() {
    this.exchange = new ccxt.binance();
    this.watchlist = [];
    this.portfolio = {};
    this.alerts = [];
  }

  // Fetch OHLCV data
  async fetchOHLCV(symbol, timeframe = '1h', limit = 500) {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      return ohlcv.map(candle => ({
        timestamp: new Date(candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      console.error(`Error fetching OHLCV for ${symbol}:`, error.message);
      return null;
    }
  }

  // Calculate technical indicators
  calculateIndicators(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    try {
      // RSI
      const rsi = TI.RSI.calculate({
        values: closes,
        period: 14
      });

      // MACD
      const macd = TI.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      // Bollinger Bands
      const bb = TI.BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
      });

      // SMA
      const sma20 = TI.SMA.calculate({ period: 20, values: closes });
      const sma50 = TI.SMA.calculate({ period: 50, values: closes });
      const sma200 = TI.SMA.calculate({ period: 200, values: closes });

      // EMA
      const ema12 = TI.EMA.calculate({ period: 12, values: closes });
      const ema26 = TI.EMA.calculate({ period: 26, values: closes });

      // Stochastic
      const stoch = TI.Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
      });

      // ATR
      const atr = TI.ATR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
      });

      return {
        rsi: rsi[rsi.length - 1] || 0,
        macd: macd[macd.length - 1] || { MACD: 0, signal: 0, histogram: 0 },
        bb: bb[bb.length - 1] || { upper: 0, middle: 0, lower: 0 },
        sma20: sma20[sma20.length - 1] || 0,
        sma50: sma50[sma50.length - 1] || 0,
        sma200: sma200[sma200.length - 1] || 0,
        ema12: ema12[ema12.length - 1] || 0,
        ema26: ema26[ema26.length - 1] || 0,
        stoch: stoch[stoch.length - 1] || { k: 0, d: 0 },
        atr: atr[atr.length - 1] || 0
      };
    } catch (error) {
      console.error('Error calculating indicators:', error);
      return null;
    }
  }

  // RSI Divergence Strategy
  rsiDivergenceStrategy(data, indicators) {
    const signals = [];
    const rsi = indicators.rsi;
    const currentPrice = data[data.length - 1].close;

    if (rsi < 25) {
      signals.push({ type: 'STRONG BUY', description: `RSI extremely oversold: ${rsi.toFixed(2)}` });
    } else if (rsi < 35) {
      signals.push({ type: 'BUY', description: `RSI oversold: ${rsi.toFixed(2)}` });
    } else if (rsi > 75) {
      signals.push({ type: 'STRONG SELL', description: `RSI extremely overbought: ${rsi.toFixed(2)}` });
    } else if (rsi > 65) {
      signals.push({ type: 'SELL', description: `RSI overbought: ${rsi.toFixed(2)}` });
    }

    return signals;
  }

  // MACD Crossover Strategy
  macdCrossoverStrategy(data, indicators) {
    const signals = [];
    const macd = indicators.macd;

    if (macd.MACD > macd.signal && macd.histogram > 0) {
      signals.push({ type: 'BUY', description: 'MACD bullish crossover' });
    } else if (macd.MACD < macd.signal && macd.histogram < 0) {
      signals.push({ type: 'SELL', description: 'MACD bearish crossover' });
    }

    return signals;
  }

  // Bollinger Bands Strategy
  bollingerBandsStrategy(data, indicators) {
    const signals = [];
    const currentPrice = data[data.length - 1].close;
    const bb = indicators.bb;

    if (currentPrice < bb.lower) {
      signals.push({ type: 'BUY', description: 'Price broke below lower Bollinger Band' });
    } else if (currentPrice > bb.upper) {
      signals.push({ type: 'SELL', description: 'Price broke above upper Bollinger Band' });
    }

    return signals;
  }

  // Volume Breakout Strategy
  volumeBreakoutStrategy(data) {
    const signals = [];
    if (data.length < 21) return signals;

    const current = data[data.length - 1];
    const previous = data[data.length - 2];
    const avgVolume = data.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20;
    const priceChange = ((current.close - previous.close) / previous.close) * 100;

    if (current.volume > avgVolume * 2) {
      if (priceChange > 2) {
        signals.push({ type: 'STRONG BUY', description: `High volume breakout: ${priceChange.toFixed(2)}% move` });
      } else if (priceChange < -2) {
        signals.push({ type: 'STRONG SELL', description: `High volume breakdown: ${priceChange.toFixed(2)}% move` });
      }
    }

    return signals;
  }

  // Analyze market sentiment
  analyzeSentiment(signals) {
    let score = 0;
    
    signals.forEach(signal => {
      if (signal.type.includes('STRONG BUY') || signal.type.includes('BULLISH')) {
        score += 3;
      } else if (signal.type.includes('BUY')) {
        score += 1;
      } else if (signal.type.includes('STRONG SELL') || signal.type.includes('BEARISH')) {
        score -= 3;
      } else if (signal.type.includes('SELL')) {
        score -= 1;
      }
    });

    let sentiment = 'NEUTRAL';
    if (score > 5) sentiment = 'VERY BULLISH';
    else if (score > 2) sentiment = 'BULLISH';
    else if (score < -5) sentiment = 'VERY BEARISH';
    else if (score < -2) sentiment = 'BEARISH';

    return { sentiment, score };
  }

  // Main analysis function
  async analyzeCoin(symbol) {
    try {
      const data = await this.fetchOHLCV(symbol);
      if (!data || data.length < 200) {
        throw new Error('Insufficient data for analysis');
      }

      const indicators = this.calculateIndicators(data);
      if (!indicators) {
        throw new Error('Failed to calculate indicators');
      }

      const latest = data[data.length - 1];

      // Get all trading signals
      const rsiSignals = this.rsiDivergenceStrategy(data, indicators);
      const macdSignals = this.macdCrossoverStrategy(data, indicators);
      const bbSignals = this.bollingerBandsStrategy(data, indicators);
      const volumeSignals = this.volumeBreakoutStrategy(data);

      const allSignals = [...rsiSignals, ...macdSignals, ...bbSignals, ...volumeSignals];
      const sentimentData = this.analyzeSentiment(allSignals);

      // Calculate support and resistance levels
      const recent50 = data.slice(-50);
      const currentPrice = latest.close;
      
      const resistanceLevels = recent50
        .filter(d => d.high > currentPrice)
        .map(d => d.high)
        .sort((a, b) => a - b);
      
      const supportLevels = recent50
        .filter(d => d.low < currentPrice)
        .map(d => d.low)
        .sort((a, b) => b - a);

      return {
        symbol,
        currentPrice: latest.close,
        volume24h: latest.volume,
        indicators,
        signals: allSignals,
        sentiment: sentimentData,
        support: supportLevels[0] || null,
        resistance: resistanceLevels[0] || null,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      return null;
    }
  }

  // Get top performers
  async getTopPerformers() {
    try {
      const tickers = await this.exchange.fetchTickers();
      const usdtPairs = Object.entries(tickers)
        .filter(([symbol, data]) => symbol.includes('/USDT') && data.percentage !== null)
        .map(([symbol, data]) => ({
          symbol,
          price: data.last,
          change24h: data.percentage,
          volume24h: data.baseVolume || 0
        }))
        .sort((a, b) => (b.change24h || 0) - (a.change24h || 0))
        .slice(0, 20);

      return usdtPairs;
    } catch (error) {
      console.error('Error fetching top performers:', error);
      return [];
    }
  }

  // Get Fear & Greed Index
  async getFearGreedIndex() {
    try {
      const response = await axios.get('https://api.alternative.me/fng/');
      const data = response.data.data[0];
      return {
        value: parseInt(data.value),
        classification: data.value_classification,
        timestamp: data.timestamp
      };
    } catch (error) {
      console.error('Error fetching Fear & Greed Index:', error);
      return null;
    }
  }
}

// Initialize bot
const cryptoBot = new AdvancedCryptoBot();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/analyze', async (req, res) => {
  const { symbol } = req.body;
  try {
    const analysis = await cryptoBot.analyzeCoin(symbol);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-performers', async (req, res) => {
  try {
    const performers = await cryptoBot.getTopPerformers();
    res.json(performers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fear-greed', async (req, res) => {
  try {
    const index = await cryptoBot.getFearGreedIndex();
    res.json(index);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/watchlist/add', (req, res) => {
  const { symbol } = req.body;
  if (!cryptoBot.watchlist.includes(symbol)) {
    cryptoBot.watchlist.push(symbol);
  }
  res.json({ success: true, watchlist: cryptoBot.watchlist });
});

app.delete('/api/watchlist/:symbol', (req, res) => {
  const { symbol } = req.params;
  cryptoBot.watchlist = cryptoBot.watchlist.filter(s => s !== symbol);
  res.json({ success: true, watchlist: cryptoBot.watchlist });
});

app.get('/api/watchlist', (req, res) => {
  res.json(cryptoBot.watchlist);
});

// Get watchlist analysis
app.get('/api/watchlist/analysis', async (req, res) => {
  try {
    const watchlistData = [];
    for (const symbol of cryptoBot.watchlist) {
      try {
        const analysis = await cryptoBot.analyzeCoin(symbol);
        if (analysis) {
          watchlistData.push(analysis);
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
    res.json(watchlistData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Advanced Crypto Bot Server running on port ${PORT}`);
  console.log(`📊 API available at: http://localhost:${PORT}/api`);
});