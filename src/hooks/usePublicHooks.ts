import { computed } from "vue";
import { useDark } from "@pureadmin/utils";

/**
 * 系统管理页面的公共 Hook。
 *
 * 原实现是在 `views/{artist,banner,feedback,playlist,song,user}/hooks.ts`
 * 各放一份完全相同的副本（6 份 MD5 一致），改一处需要同步六处。
 * 现统一收拢到此处，各页面直接从 `@/hooks/usePublicHooks` 引入。
 */
export function usePublicHooks() {
  const { isDark } = useDark();

  const switchStyle = computed(() => {
    return {
      "--el-switch-on-color": "#6abe39",
      "--el-switch-off-color": "#e84749"
    };
  });

  const tagStyle = computed(() => {
    return (status: number) => {
      return status === 1
        ? {
            "--el-tag-text-color": isDark.value ? "#6abe39" : "#389e0d",
            "--el-tag-bg-color": isDark.value ? "#172412" : "#f6ffed",
            "--el-tag-border-color": isDark.value ? "#274a17" : "#b7eb8f"
          }
        : {
            "--el-tag-text-color": isDark.value ? "#e84749" : "#cf1322",
            "--el-tag-bg-color": isDark.value ? "#2b1316" : "#fff1f0",
            "--el-tag-border-color": isDark.value ? "#58191c" : "#ffa39e"
          };
    };
  });

  return {
    /** 当前网页是否为 `dark` 模式 */
    isDark,
    /** 表现更鲜明的 `el-switch` 组件 */
    switchStyle,
    /** 表现更鲜明的 `el-tag` 组件 */
    tagStyle
  };
}