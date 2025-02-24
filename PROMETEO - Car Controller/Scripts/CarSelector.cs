using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("基础设置")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // 需要控制的脚本名称
    public string lidarScriptName = "CameraFollow"; // 需要控制的脚本名称
    public string lidarParentName = "lidars";
    public Camera topCamera;

    private bool isSelected = false;
    private Camera mainCamera;
    private Transform currentParent;       // 当前缓存的父对象
    private MonoBehaviour currentScript;   // 当前缓存的脚本
    private List<MonoBehaviour> lidarScripts = new List<MonoBehaviour>(); // 缓存lidar脚本
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
            Debug.LogError($"未找到Lidar父物体: {lidarParentName}");
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
                DisablePreviousScriptWithClear(); // 禁用前调用Clear
                CacheAndEnableNewScript(newParent);
                AssignToAllCarTransforms(newParent); // 同步所有关联脚本
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
            // 反射调用Clear方法
            MethodInfo clearMethod = currentScript.GetType().GetMethod("Clear");
            if (clearMethod != null)
            {
                clearMethod.Invoke(currentScript, null);
                Debug.Log($"已调用Clear方法: {currentScript.GetType().Name}");
            }

            currentScript.enabled = false;
        }
    }

    void AssignToAllCarTransforms(Transform target)
    {
        // 更新主摄像机
        CameraFollow cameraFollow = mainCamera.GetComponent<CameraFollow>();
        if (cameraFollow != null) cameraFollow.carTransform = target;

        // 更新所有lidar脚本
        foreach (MonoBehaviour script in lidarScripts)
        {
            if (script != null)
            {
                // 使用反射设置字段值
                FieldInfo field = script.GetType().GetField("carTransform");
                if (field != null)
                {
                    field.SetValue(script, target);
                }
            }
        }
        Debug.Log($"已同步{lidarScripts.Count}个Lidar脚本的carTransform");
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
            Debug.Log($"已禁用脚本: {currentScript.GetType().Name}");
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
            Debug.Log($"已启用脚本: {currentScript.GetType().Name}");
        }
        else
        {
            Debug.LogError($"父物体 {parent.name} 上未找到脚本: {targetScriptName}");
        }
    }

    void ClearAll()
    {
        isSelected = false;
        DisablePreviousScript();
        currentParent = null;
        currentScript = null;
    }

    // 安全清理（场景切换时调用）
    void OnDestroy()
    {
        ClearAll();
    }
}