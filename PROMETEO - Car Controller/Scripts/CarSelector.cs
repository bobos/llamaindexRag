using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("��������")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // ��Ҫ���ƵĽű�����
    public string lidarScriptName = "CameraFollow"; // ��Ҫ���ƵĽű�����
    public string lidarParentName = "lidars";
    public Camera topCamera;

    private bool isSelected = false;
    private Camera mainCamera;
    private Transform currentParent;       // ��ǰ����ĸ�����
    private MonoBehaviour currentScript;   // ��ǰ����Ľű�
    private List<MonoBehaviour> lidarScripts = new List<MonoBehaviour>(); // ����lidar�ű�
    private GameManager gameManager;

    public static AdvancedMouseSelector Instance { get; private set; }

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
    void Start()
    {
        mainCamera = Camera.main;
        gameManager = GameManager.Instance;
        CacheLidarScripts();
    }

    public bool IsSelected()
    {
        return isSelected;
    }
    void CacheLidarScripts()
    {
        GameObject lidarParent = GameObject.Find(lidarParentName);
        if (lidarParent != null)
        {
            foreach (Transform child in lidarParent.transform)
            {
                MonoBehaviour script = child.GetComponent(lidarScriptName) as MonoBehaviour;
                if (script != null)
                {
                    lidarScripts.Add(script);
                }
            }
        }
        else
        {
            Debug.LogError($"δ�ҵ�Lidar������: {lidarParentName}");
        }
    }

    void Update()
    {
        if (!gameManager.IsActive())
        {
            ClearAll();
            return;
        }
        if (Input.GetMouseButtonDown(0))
        {
            HandleSelection();
        }
    }

   void HandleSelection()
    {
        Camera camera = mainCamera.isActiveAndEnabled ? mainCamera : topCamera;
        Ray ray = camera.ScreenPointToRay(Input.mousePosition);
        RaycastHit hit;

        if (Physics.Raycast(ray, out hit, Mathf.Infinity, carMask))
        {
            Transform newParent = GetTopParent(hit.collider.transform);
            if (newParent != null && newParent != currentParent)
            {
                PrometeoCarController script = newParent.GetComponent<PrometeoCarController>();
                if (!script.IsUnlocked())
                {
                    if (!gameManager.UseCarKey(script.GetInstanceID()))
                    {
                        return;
                    }
                    script.EnableIndicator();
                }
                DisablePreviousScriptWithClear(); // ����ǰ����Clear
                CacheAndEnableNewScript(newParent);
                AssignToAllCarTransforms(newParent); // ͬ�����й����ű�
            }
        }
        else
        {
            ClearAll();
        }
    }

    void DisablePreviousScriptWithClear()
    {
        if (currentScript != null)
        {
            // �������Clear����
            MethodInfo clearMethod = currentScript.GetType().GetMethod("Clear");
            if (clearMethod != null)
            {
                clearMethod.Invoke(currentScript, null);
                Debug.Log($"�ѵ���Clear����: {currentScript.GetType().Name}");
            }

            currentScript.enabled = false;
        }
    }

    void AssignToAllCarTransforms(Transform target)
    {
        // �����������
        CameraFollow cameraFollow = mainCamera.GetComponent<CameraFollow>();
        if (cameraFollow != null) cameraFollow.carTransform = target;

        // ��������lidar�ű�
        foreach (MonoBehaviour script in lidarScripts)
        {
            if (script != null)
            {
                // ʹ�÷��������ֶ�ֵ
                FieldInfo field = script.GetType().GetField("carTransform");
                if (field != null)
                {
                    field.SetValue(script, target);
                }
            }
        }
        Debug.Log($"��ͬ��{lidarScripts.Count}��Lidar�ű���carTransform");
    }
    
    Transform GetTopParent(Transform child)
    {
        while (child.parent != null)
        {
            child = child.parent;
        }
        return child;
    }

    void DisablePreviousScript()
    {
        if (currentScript != null)
        {
            currentScript.enabled = false;
            Debug.Log($"�ѽ��ýű�: {currentScript.GetType().Name}");
        }
    }

    void CacheAndEnableNewScript(Transform parent)
    {
        isSelected = true;
        currentParent = parent;
        currentScript = parent.GetComponent(targetScriptName) as MonoBehaviour;

        if (currentScript != null)
        {
            currentScript.enabled = true;
            Debug.Log($"�����ýű�: {currentScript.GetType().Name}");
        }
        else
        {
            Debug.LogError($"������ {parent.name} ��δ�ҵ��ű�: {targetScriptName}");
        }
    }

    void ClearAll()
    {
        isSelected = false;
        DisablePreviousScript();
        currentParent = null;
        currentScript = null;
    }

    // ��ȫ���������л�ʱ���ã�
    void OnDestroy()
    {
        ClearAll();
    }
}