# Phase 11 UAT: Admin 运行时边界收口

## 1. 范围

本 UAT 用于验证 Phase 11 对 `QUAL-01` 的收口证据：Admin 导入审核页和歌曲目录页已经把运行时查询、变更、缓存更新、选择修复和忙碌状态聚合从页面组件中抽出到功能本地 hook。

- Import Workbench 的运行时边界位于 `apps/admin/src/imports/use-import-workbench-runtime.ts`，导出 `useImportWorkbenchRuntime`。
- Song Catalog 的运行时边界位于 `apps/admin/src/songs/use-song-catalog-runtime.ts`，导出 `useSongCatalogRuntime`。
- `ImportWorkbench.tsx` 和 `SongCatalogView.tsx` 保持渲染壳职责，继续保留现有中文标签、布局、加载/错误提示、忙碌状态和变更行为。
- Phase 11 只针对审计指出的 Admin Import/Songs 边界关闭 `QUAL-01`，不新增产品能力、不改变导入或歌库维护工作流。

## 2. 自动化验证

按顺序运行以下命令，全部退出码应为 0：

```bash
pnpm -F @home-ktv/admin test -- src/test/import-workbench-runtime.test.tsx
pnpm -F @home-ktv/admin test -- src/test/import-workbench.test.tsx
pnpm -F @home-ktv/admin test -- src/test/song-catalog-runtime.test.tsx
pnpm -F @home-ktv/admin test -- src/test/song-catalog.test.tsx
pnpm -F @home-ktv/admin test
pnpm -F @home-ktv/admin typecheck
pnpm typecheck
```

通过含义：

- Runtime hook 测试覆盖 `useImportWorkbenchRuntime` 和 `useSongCatalogRuntime` 的查询、选择、缓存更新和变更副作用。
- 既有页面测试继续锁定 Admin Import/Songs 的中文文案、按钮状态、加载/错误状态和用户可见变更行为。
- Admin 和 workspace typecheck 证明抽取后类型边界仍然健康。

## 3. 结构检查

运行或人工确认以下结构检查：

```bash
rg "useImportWorkbenchRuntime" apps/admin/src/imports/ImportWorkbench.tsx apps/admin/src/imports/use-import-workbench-runtime.ts
rg "useSongCatalogRuntime" apps/admin/src/songs/SongCatalogView.tsx apps/admin/src/songs/use-song-catalog-runtime.ts
! rg "useMutation\\(|useQueries\\(|fetchAdmin<" apps/admin/src/imports/ImportWorkbench.tsx
! rg "useMutation\\(|useQuery\\(" apps/admin/src/songs/SongCatalogView.tsx
```

应满足：

- `ImportWorkbench.tsx` imports `useImportWorkbenchRuntime`.
- `ImportWorkbench.tsx` no longer contains `useMutation(`, `useQueries(`, or `fetchAdmin<`.
- `SongCatalogView.tsx` imports `useSongCatalogRuntime`.
- `SongCatalogView.tsx` no longer contains `useMutation(` or `useQuery(`.
- `apps/admin/src/imports/use-import-workbench-runtime.ts` contains `useImportWorkbenchRuntime`.
- `apps/admin/src/songs/use-song-catalog-runtime.ts` contains `useSongCatalogRuntime`.

## 4. 后台人工检查

如果选择启动 Admin 进行人工 UAT，请检查以下行为仍与 Phase 11 前一致：

- Import tab 仍默认中文，并打开导入审核工作台。
- Import 扫描按钮 pending 时仍显示 `扫描中...`，结束后恢复为 `扫描导入目录`。
- Import candidate groups、detail editor、save metadata、hold、approve、reject-delete 和 conflict resolution 仍可见且可用。
- Songs tab 仍显示 filters、song list、detail editor、default asset action、asset update、revalidation 和 `校验 song.json`。
- 加载失败文案保持为 `候选加载失败，请稍后重试。` 和 `歌曲加载失败，请稍后重试。`。

## 5. 通过标准

Phase 11 通过标准：

- 所有自动化验证命令退出码为 0。
- 结构检查证明页面组件只消费运行时 hook，不再直接承载 TanStack Query orchestration。
- 人工检查未发现 Admin Import/Songs 的中文文案、布局、忙碌状态、加载错误行为或变更行为回归。
- `QUAL-01` 在本阶段仅对已审计的 Admin Import/Songs runtime boundary 完成关闭；Mobile/TV 以及其他 Admin 页面能力不在本 UAT 新增范围内。
