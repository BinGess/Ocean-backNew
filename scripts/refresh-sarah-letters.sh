#!/usr/bin/env bash
# =============================================================================
# Sarah 信件历史补全脚本
#
# 用途：为所有用户补全历史周报。
#       已经生成过的周自动跳过，只补缺失的。
#       适用于新版本上线后，补齐历史用户尚未生成的 Sarah 信件。
#
# 使用方式（在服务端项目根目录执行）：
#   bash scripts/refresh-sarah-letters.sh
# =============================================================================

set -euo pipefail

BASE_URL="${SERVER_BASE_URL:-http://localhost:3000}"

if [ -z "${SARAH_INTERNAL_TOKEN:-}" ]; then
  echo "[ERROR] 环境变量 SARAH_INTERNAL_TOKEN 未设置，请检查服务端环境配置"
  exit 1
fi

echo ""
echo "======================================"
echo "  Sarah 信件历史补全"
echo "  服务地址: $BASE_URL"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"
echo ""
echo "说明：已有信件的周不会重复生成，只补缺失的周。"
echo "      后台任务启动后可通过日志查看进度。"
echo ""

HTTP_STATUS=$(curl -s -o /tmp/_sarah_backfill_resp.json -w "%{http_code}" \
  -X POST "${BASE_URL}/sarah/admin/backfill-historical" \
  -H "x-internal-token: ${SARAH_INTERNAL_TOKEN}" \
  -H "Content-Type: application/json" \
  --max-time 10)

RESP_BODY=$(cat /tmp/_sarah_backfill_resp.json 2>/dev/null || echo "")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "202" ]; then
  echo "[OK] 后台补全任务已启动 (HTTP ${HTTP_STATUS})"
  echo "     响应: ${RESP_BODY}"
  echo ""
  echo "通过日志关键词跟踪进度："
  echo "  [Sarah Backfill]  主进度（处理了多少用户/周）"
  echo "  [Sarah Dedup]     补全完成后自动去重"
  echo ""
  echo "看到以下日志说明全部完成："
  echo "  [Sarah Dedup] Done — soft-deleted X duplicate legacy letters"
else
  echo "[ERROR] 接口调用失败 (HTTP ${HTTP_STATUS})"
  echo "        响应: ${RESP_BODY}"
  exit 1
fi
