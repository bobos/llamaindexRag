import sys
import os
import tushare as ts
import time

# 中航西飞 000768.SZ
# 特变电工 600089.SH
# 比音 002832.SZ
# 山西焦煤 000983.SZ *
# 燕京啤酒 000729.SZ *
# 中远海能 600026.SH
# 葵花药业 002737.SZ *
# 白云山 600332.SH
# 千禾味业 603027.SH
# 中国船舶 600150.SH
# 平高电气 600312.SH *

ts_code = '000768.SZ,600089.SH,002832.SZ,000983.SZ,000729.SZ,600026.SH,002737.SZ,600332.SH,603027.SH,600150.SH,600312.SH'
quoteCache = set()

while True:
  try:
    df = ts.realtime_quote(ts_code=ts_code)

    for _, row in df.iterrows():
      stock_name = row['TS_CODE']
      filename = f"{stock_name}_quote.txt"

      # 提取时间价格数据
      key = stock_name + row['TIME']
      if key not in quoteCache:
        quoteCache.add(key)
        csv_line = f"{row['TIME']}, {row['PRICE']}\n"

        # 检查文件是否存在
        write_header = not os.path.exists(filename)

        with open(filename, 'a', encoding='utf-8', newline='\n') as f:
            # 写入表头（如果需要）
            if write_header:
                f.write("时间, 现价(元)\n")
            # 追加数据行
            f.write(csv_line)
            print(f"数据已追加到 {filename}")

    # 等待5分钟（300秒）
    print("等待1分钟后再次执行...")
    time.sleep(60)

  except Exception as e:
      print(f"操作失败：{str(e)}")
      sys.exit(1)