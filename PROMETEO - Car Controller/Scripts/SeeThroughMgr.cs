using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class RendererTimerManager : MonoBehaviour
{   
    [Header("遮挡处理")]
    [SerializeField] private float fadeAlpha = 0.3f;   // 透明时的Alpha值
    [SerializeField] private float fadeSpeed = 5f;     // 透明度变化速度

    public static RendererTimerManager Instance { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(this);
        }
        else
        {
            Instance = this;
        }
    }

    private struct RendererTrackingData
    {
        public int id;
        public Material[] originMaterials;
        public Coroutine timer;
    }

    private Dictionary<int, RendererTrackingData> lookupTable = new Dictionary<int, RendererTrackingData>();
    private float duration = 5f; // 3 sec

    // 添加需要计时的Renderer及其持续时间
    public void AddRenderer(Renderer renderer)
    {
        if (renderer == null) return;

        int id = renderer.gameObject.GetInstanceID();

        // 如果已存在该Renderer的计时器，先停止旧计时器
        if (lookupTable.TryGetValue(id, out RendererTrackingData data))
        {
            StopCoroutine(data.timer);
            data.timer = StartCoroutine(StartTimer(id, renderer, duration));
            lookupTable[id] = data;
        }
        else
        {
            RendererTrackingData trackingData = new RendererTrackingData();
            //备份原始材质
            trackingData.originMaterials = new Material[renderer.materials.Length];
            for (int i = 0; i < renderer.materials.Length; i++)
            {
                trackingData.originMaterials[i] = new Material(renderer.materials[i]);
            }
            trackingData.timer = StartCoroutine(StartTimer(id, renderer, duration));
            lookupTable[id] = trackingData;
        }
    }

    // 计时器协程
    private IEnumerator StartTimer(int id, Renderer renderer, float duration)
    {
        // 半透明renderer
        foreach (Material mat in renderer.materials)
        {
            Color color = mat.color;
            float targetAlpha = Mathf.Lerp(color.a, fadeAlpha, fadeSpeed * Time.deltaTime);
            mat.color = new Color(color.r, color.g, color.b, targetAlpha);
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
        }

        yield return new WaitForSeconds(duration);

        // 执行结束逻辑并清理
        OnTimerEnd(id, renderer);
        lookupTable.Remove(id);
    }

    // 计时结束时的处理逻辑（可重写实现自定义行为）
    protected virtual void OnTimerEnd(int id, Renderer renderer)
    {
        //恢复renderer
        if (lookupTable.TryGetValue(id, out RendererTrackingData data))
        {
            Material[] materials = new Material[data.originMaterials.Length];
            for (int i = 0; i < data.originMaterials.Length; i++)
            {
                materials[i] = new Material(data.originMaterials[i]);
            }
            renderer.materials = materials;
        }
    }

    // 组件销毁时清理所有计时器
    private void OnDestroy()
    {
        foreach (var data in lookupTable.Values)
        {
            StopCoroutine(data.timer);
        }
        lookupTable.Clear();
    }
}