using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class RendererTimerManager : MonoBehaviour
{   
    [Header("�ڵ�����")]
    [SerializeField] private float fadeAlpha = 0.3f;   // ͸��ʱ��Alphaֵ
    [SerializeField] private float fadeSpeed = 5f;     // ͸���ȱ仯�ٶ�

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

    // �����Ҫ��ʱ��Renderer�������ʱ��
    public void AddRenderer(Renderer renderer)
    {
        if (renderer == null) return;

        int id = renderer.gameObject.GetInstanceID();

        // ����Ѵ��ڸ�Renderer�ļ�ʱ������ֹͣ�ɼ�ʱ��
        if (lookupTable.TryGetValue(id, out RendererTrackingData data))
        {
            StopCoroutine(data.timer);
            data.timer = StartCoroutine(StartTimer(id, renderer, duration));
            lookupTable[id] = data;
        }
        else
        {
            RendererTrackingData trackingData = new RendererTrackingData();
            //����ԭʼ����
            trackingData.originMaterials = new Material[renderer.materials.Length];
            for (int i = 0; i < renderer.materials.Length; i++)
            {
                trackingData.originMaterials[i] = new Material(renderer.materials[i]);
            }
            trackingData.timer = StartCoroutine(StartTimer(id, renderer, duration));
            lookupTable[id] = trackingData;
        }
    }

    // ��ʱ��Э��
    private IEnumerator StartTimer(int id, Renderer renderer, float duration)
    {
        // ��͸��renderer
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

        // ִ�н����߼�������
        OnTimerEnd(id, renderer);
        lookupTable.Remove(id);
    }

    // ��ʱ����ʱ�Ĵ����߼�������дʵ���Զ�����Ϊ��
    protected virtual void OnTimerEnd(int id, Renderer renderer)
    {
        //�ָ�renderer
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

    // �������ʱ�������м�ʱ��
    private void OnDestroy()
    {
        foreach (var data in lookupTable.Values)
        {
            StopCoroutine(data.timer);
        }
        lookupTable.Clear();
    }
}