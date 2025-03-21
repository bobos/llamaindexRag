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
    public Transform car;
    
    private float originalZScale;     // 初始Z轴尺寸
    private Vector3 lastMousePosition; // 用于计算鼠标位移
    private Transform currentObstacle; // 当前选中
    private bool isDragging = false;    // 拖拽状态标记
    private Vector3 offset;             // 点击位置与物体中心的偏移量
    private float groundZ = 0;          // 地面Z坐标（根据实际情况调整）

    private bool isCarSelected = false;
    private bool driveMode = false;
    private GameManager gameManager;
    private PrometeoCarController carScript;

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
        carScript = car.GetComponent<PrometeoCarController>();
        carScript.enabled = false;
    }

    public bool IsSelected()
    {
        return driveMode;
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
                    script.carTransform = car;
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
        if (!gameManager.IsActive() || driveMode)
        {
            return;
        }
        HandleRotation();
        HandleDragging();
         // 结束操作
        if (Input.GetMouseButtonUp(0) || Input.GetMouseButtonUp(1))
        {
            DeselectObject();
        }

        // 持续拖拽
        if (isDragging && Input.GetMouseButton(0))
        {
            if (Input.GetMouseButton(0) && !Input.GetMouseButton(1) && currentObstacle != null)
            {
                Vector3 newPosition = GetMouseWorldPosition() + offset;
                newPosition.y = currentObstacle.position.y; // 锁定Y轴
                currentObstacle.position = newPosition;

                // 滚轮缩放
                float scroll = Input.GetAxis("Mouse ScrollWheel");
                if (scroll != 0 && !isCarSelected)
                {
                    Vector3 newScale = currentObstacle.localScale;
                    newScale.z = Mathf.Clamp(
                        newScale.z + scroll * zoomSpeed,
                        originalZScale / 6f,
                        originalZScale * 4f
                    );
                    currentObstacle.localScale = newScale;
                }
            }
        }
    }

    void HandleRotation()
    {
        // 右键按下时选择物体
        if (Input.GetMouseButtonDown(1) && HandleSelection())
        {
            lastMousePosition = Input.mousePosition;
        }

        // 按住右键旋转
        if (Input.GetMouseButton(1) && currentObstacle != null)
        {
            // 计算水平位移差
            float mouseDelta = (Input.mousePosition.x - lastMousePosition.x) * 0.1f;
            
            // 应用旋转（更慢的速度）
            currentObstacle.Rotate(
                0, 
                mouseDelta * rotateSpeed, 
                0,
                Space.World
            );
        }
        lastMousePosition = Input.mousePosition;
    }

    void HandleDragging()
    {
        if (!Input.GetMouseButtonDown(0)) { return; }

        if (HandleSelection())
        {
            isDragging = true;
            // 计算偏移量（世界坐标）
            offset = currentObstacle.position - GetMouseWorldPosition();
            // 记录初始数据
            originalZScale = currentObstacle.localScale.z;
            lastMousePosition = Input.mousePosition;
        }
    }

    bool HandleSelection()
    {   
        Ray ray = topCamera.ScreenPointToRay(Input.mousePosition);
        RaycastHit hit;

        if (Physics.Raycast(ray, out hit, Mathf.Infinity, obstacleLayer | carMask))
        {
            if (isInLayerMask(hit.collider.gameObject.layer, carMask.value))
            {
                Debug.Log("car selected");
                isCarSelected = true;
                Transform newParent = GetTopParent(hit.collider.transform);
                SelectObject(newParent);
            }
            else
            {
                Debug.Log("obstacle selected");
                isCarSelected = false;
                SelectObject(hit.collider.transform);
            }
            return true;
        } else
        {
            return false;
        }
    }

    void DeselectObject()
    {
        if(currentObstacle != null && !isCarSelected)
        {
            currentObstacle.GetComponent<SelectedEffect>().Deselect();
        }
        currentObstacle = null;
        isDragging = false;
    }
    void SelectObject(Transform obj)
    {
        // 设置新选择
        currentObstacle = obj;
        if (!isCarSelected) currentObstacle.GetComponent<SelectedEffect>().Select();
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
    
    Transform GetTopParent(Transform child)
    {
        while (child.parent != null)
        {
            child = child.parent;
        }
        return child;
    }

    public void EnterDriveMode()
    {
        carScript.enabled = true;
        driveMode = true;
        // 更新主摄像机
        CameraFollow cameraFollow = mainCamera.GetComponent<CameraFollow>();
        if (cameraFollow != null) cameraFollow.carTransform = car;

        foreach (LidarController script in lidarScripts)
        {
            script.StartCheck();
        }
    }

    public void EnterEditorMode()
    {
        driveMode = false;
        carScript.enabled = false;
        foreach (LidarController script in lidarScripts)
        {
            if (script != null)
            {
                script.StopCheck();
            }
        }
    }
}