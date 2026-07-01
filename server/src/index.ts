import app from './app';

const PORT = parseInt(process.env.PORT || '4000');

app.listen(PORT, () => {
  console.log(`🚀 Kaizen Reporting API — port ${PORT}`);
});
