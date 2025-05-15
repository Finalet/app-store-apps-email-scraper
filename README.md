## Instructions

### 1. Setup

1. Add an `input/apps.csv` file with URLs to the App Store apps you want to start with, all in the first column.
2. Add an `input/ignore.csv` file with app ID's of the apps you want to ignore, all in the first column.

### 2. Install dependencies

```
npm i
```

### 3. Run

```
npm run start
```

Use `depth=*` parameter to control how many interations of scraping "Similar apps" you want.
```
npm run start -- depth=2
```

Add `rfs=0` parameter if you don't want to save results from the first step (use apps from the first step only to collect more apps and continue from them).
```
npm run start -- rfs=0
```

### 4. ...?

### 5. Profit.

Results will be saved into `output/*.csv` as they come in.
