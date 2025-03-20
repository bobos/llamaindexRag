using UnityEngine;
using System.Collections.Generic;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("基础设置")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // 需要控制的脚本名称
    public Camera topCamera;
    public Camera mainCamera;
    public LayerMask obstacleLayer;    // 障碍物所在层
    public float zoomSpeed = 3f;       // 缩放速度
    public float rotateSpeed = 2f;   // 旋转速度
    
    private float originalZScale;     // 初始Z轴尺寸
    private Vector3 lastMousePosition; // 用于计算鼠标位移
    private GameObject currentObstacle; // 当前选中的障碍物
    private bool isDragging = false;    // 拖拽状态标记
    private Vector3 offset;             // 点击位置与物体中心的偏移量
    private float groundZ = 0;          // 地面Z坐标（根据实际情况调整）

    private bool isSelected = false;
    private Transform currentParent;       // 当前缓存的父对象
    private PrometeoCarController currentScript;   // 当前缓存的脚本
    private GameManager gameManager;

    List<LidarController> lidarScripts = new List<LidarController>();
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
        gameManager = GameManager.Instance;
        CacheLidarScripts();
    }

    public bool IsSelected()
    {
        return isSelected;
    }

    void CacheLidarScripts()
    {
        GameObject lidarParent = GameObject.Find("lidars"); //找到全局game object by name
        if (lidarParent != null)
        {
            foreach (Transform child in lidarParent.transform)
            {
                LidarController script = child.GetComponent<LidarController>();
                if (script != null)
                {
                    lidarScripts.Add(script);
                }
            }
        }
        else
        {
            Debug.LogError($"未找到Lidar父物体");
        }
    }

    void Update()
    {
        if (!gameManager.IsActive())
        {
            ClearAll();
            return;
        }
        HandleRotation();
        // 持续拖拽
        if (isDragging && Input.GetMouseButton(0))
        {
            if (Input.GetMouseButton(0) && !Input.GetMouseButton(1) && currentObstacle != null)
            {
                Vector3 newPosition = GetMouseWorldPosition() + offset;
                newPosition.y = currentObstacle.transform.position.y; // 锁定Y轴
                currentObstacle.transform.position = newPosition;

                // 滚轮缩放
                float scroll = Input.GetAxis("Mouse ScrollWheel");
                if (scroll != 0)
                {
                    Vector3 newScale = currentObstacle.transform.localScale;
                    newScale.z = Mathf.Clamp(
                        newScale.z + scroll * zoomSpeed,
                        originalZScale / 6f,
                        originalZScale * 4f
                    );
                    currentObstacle.transform.localScale = newScale;
                }
            }
        }

        // 结束拖拽
        if (Input.GetMouseButtonUp(0))
        {
            isDragging = false;
            currentObstacle = null;
        }

        if (Input.GetMouseButtonDown(0))
        {
            HandleSelection();
        }
    }

    void HandleRotation()
    {
        // 右键按下时选择物体
        if (Input.GetMouseButtonDown(1))
        {
            RaycastHit hit;
            Ray ray = topCamera.ScreenPointToRay(Input.mousePosition);

            if (Physics.Raycast(ray, out hit, Mathf.Infinity, obstacleLayer))
            {
                currentObstacle = hit.collider.gameObject;
                lastMousePosition = Input.mousePosition;
            }
        }

        // 按住右键旋转
        if (Input.GetMouseButton(1) && currentObstacle != null)
        {
            // 计算水平位移差
            float mouseDelta = (Input.mousePosition.x - lastMousePosition.x) * 0.1f;
            
            // 应用旋转（更慢的速度）
            currentObstacle.transform.Rotate(
                0, 
                mouseDelta * rotateSpeed, 
                0,
                Space.World
            );
        }
        lastMousePosition = Input.mousePosition;
    }
    void HandleSelection()
    {   
        Camera camera = mainCamera.isActiveAndEnabled ? mainCamera : topCamera;
        Ray ray = camera.ScreenPointToRay(Input.mousePosition);
        RaycastHit hit;

        //if (Physics.Raycast(ray, out hit, Mathf.Infinity, (1 << carMask) | (1 << obstacleLayer)))
        if (Physics.Raycast(ray, out hit, Mathf.Infinity,  obstacleLayer|carMask))
        {
            if (isSelected) { return; }
            if (isInLayerMask(hit.collider.gameObject.layer, carMask.value))
            {
                Debug.Log("car selected");
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
                    }
                    currentParent = newParent;
                    DisablePreviousScriptWithClear(); // 禁用前调用Clear
                    CacheAndEnableNewScript(script);
                    AssignToAllCarTransforms(newParent); // 同步所有关联脚本
                }
            } else {
                Debug.Log("obstacle selected");
                currentObstacle = hit.collider.gameObject;
                isDragging = true;

                // 计算偏移量（世界坐标）
                offset = currentObstacle.transform.position - GetMouseWorldPosition();
                // 记录初始数据
                originalZScale = currentObstacle.transform.localScale.z;
                lastMousePosition = Input.mousePosition;
            }
        } else { 
            ClearAll();
        }
    }
    bool isInLayerMask(int layer, LayerMask layerMask)
    {
        return (layerMask.value & (1 << layer)) != 0;
    }
    // 获取鼠标在世界空间中的位置（XZ平面）
    private Vector3 GetMouseWorldPosition()
    {
        Plane plane = new Plane(Vector3.up, Vector3.up * groundZ); // XZ平面
        Ray ray = topCamera.ScreenPointToRay(Input.mousePosition);
        
        if (plane.Raycast(ray, out float distance))
        {
            return ray.GetPoint(distance);
        }
        return Vector3.zero;
    }

    void DisablePreviousScriptWithClear()
    {
        if (currentScript != null)
        {
           currentScript.Clear();
           currentScript.enabled = false;
        }
    }

    void AssignToAllCarTransforms(Transform target)
    {
        // 更新主摄像机
        CameraFollow cameraFollow = mainCamera.GetComponent<CameraFollow>();
        if (cameraFollow != null) cameraFollow.carTransform = target;

        foreach (LidarController script in lidarScripts)
        {
            script.carTransform = target;
            script.StartCheck();
        }
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

    void CacheAndEnableNewScript(PrometeoCarController newScript)
    {
        isSelected = true;
        currentScript = newScript;

        if (currentScript != null)
        {
            currentScript.enabled = true;
            Debug.Log($"已启用脚本: {currentScript.GetType().Name}");
        }
        else
        {
            Debug.LogError($"未找到脚本: {targetScriptName}");
        }
    }

    void ClearAll()
    {
        isSelected = false;
        DisablePreviousScript();
        currentParent = null;
        currentScript = null;
        foreach (LidarController script in lidarScripts)
        {
            script.StopCheck();
        }
    }

    // 安全清理（场景切换时调用）
    void OnDestroy()
    {
        ClearAll();
    }
}