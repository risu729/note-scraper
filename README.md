# note-scraper

noteから特定のハッシュタグのついた記事のデータを取得するスクリプト

## How to use

bun ([docs](https://bun.sh/docs/installation)) が必要です

```sh
git clone https://github.com/risu729/note-scraper.git
bun install
# ハッシュタグを検索するものに置き換える
bun scrape --hashtag ハッシュタグ
```

`result.csv` が生成されます
