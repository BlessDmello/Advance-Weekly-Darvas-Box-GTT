# Test fixtures

This development-only package will contain verified, redacted historical golden tests.
It currently contains no stock prices, personal trades, or synthetic market data.

Future inputs: approved Adani CSV, Nifty 100 GTT workbook, CAR workbook, and legacy
suitability workbook. Keep source identity, hashes, adjustment basis, exchange-session
dates, rule versions, and independently reviewed expected outputs with each fixture.
Validate native spreadsheet formulas rather than trusting cached XLSX values.

Do not import this package from production code. Do not place credentials or private
portfolio records in committed fixtures. Unlicensed source files remain outside Git.
